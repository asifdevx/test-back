import pLimit from "p-limit";
import { Collection } from "../mongoDb/schemas/collection.schema";
import { Event } from "../mongoDb/schemas/event.schema";
import { Token } from "../mongoDb/schemas/sch.nft";
import { EMPTY_METADATA, fetchMetadata } from "../services/ipfs.service";
import { Payload } from "../types";

interface MintEventArgs {
  chainId: number;
  contract: any;
  type: string;
  event: any;
  tokenData: {
    tokenIdStart?: number;
    quantity?: number;
    tokenId?: number;
    supply?: number;
    creator: string;
    tokenURI?: string;
    tokenURIs?: string[];
  };
}

const defaultStats = {
  totalVolume: 0,
  totalSales: 0,
  avgPrice: 0,
  stats7d: { sales: 0, avgPrice: 0, volume: 0 },
  stats14d: { sales: 0, avgPrice: 0, volume: 0 },
  stats30d: { sales: 0, avgPrice: 0, volume: 0 },
  stats60d: { sales: 0, avgPrice: 0, volume: 0 },
  stats90d: { sales: 0, avgPrice: 0, volume: 0 },
  allTime: { sales: 0, avgPrice: 0, volume: 0 },
  volumeChange24h: 0,
  volumeChange7d: 0,
};
//rate limit to satle ipfs overload
const limit = pLimit(30);
const safeFetchMetadata = async (uri: string) => {
  try {
    return await fetchMetadata(uri);
  } catch (err) {
    console.warn("Metadata fetch failed:", uri);
    return EMPTY_METADATA;
  }
};

const handleBatchMint = async ({ chainId, contract, type, event, tokenData }: MintEventArgs) => {
  try {
    const sudoCollectionAddress = event?.address || contract;
    const collectionAddress = sudoCollectionAddress?.toLowerCase();

    if (!collectionAddress) {
      console.error("Collection address not found in event:", event);
      return;
    }
    const { tokenIdStart,  tokenId, supply, creator, tokenURI: baseURI } = tokenData;

    const blockTimestamp = Date.now();

    const lowerCreator = creator?.toLowerCase();

    const tokensToCreate = [];

    if (type === "ERC721" && tokenIdStart !== undefined && supply) {
      const uris = Array.from({ length: Number(supply) }, (_, i) => {
        return `${baseURI}/${i + 1}`;
      });
      // ✅ Fetch metadata in parallel
      const results = await Promise.allSettled(uris.map((uri) => limit(() => safeFetchMetadata(uri))));

      const metas = results.map((res, idx) => {
        if (res.status === "fulfilled") return res.value;

        console.warn(`Metadata failed for tokenURI[${idx}]`);
        return EMPTY_METADATA;
      });

      for (let i = 0; i < Number(supply); i++) {
        const newTokenId = Number(tokenIdStart) + i;

        const meta = metas[i];

        tokensToCreate.push({
          chainId,
          contractType: "ERC721",
          contractAddress: collectionAddress,
          tokenId: newTokenId,
          creator: lowerCreator,
          seller: lowerCreator,
          name: meta?.name || `Token #${newTokenId}`,
          animation_url: meta.animation_url || "",
          description: meta.description || "",
          image: meta.image || "",
          attributes: meta.attributes || [],
          external_url: meta.external_url || "",
          blockTimestamp,
          supply: 1,
          metadata: meta,
          stats: defaultStats,
        });
      }
    } else if (type === "ERC1155" && tokenId !== undefined && supply) {
      // ERC-1155 style mint
      const meta = await fetchMetadata(tokenData.tokenURI);

      tokensToCreate.push({
        chainId,
        contractType: "ERC1155",
        contractAddress: collectionAddress,
        tokenId,
        creator: lowerCreator,
        seller: lowerCreator,
        name: meta.name || `Token #${tokenId}`,
        animation_url: meta.animation_url || "",

        description: meta.description || "",
        image: meta.image || "",
        attributes: meta.attributes || [],
        external_url: meta.external_url || "",
        blockTimestamp,
        supply,
        metadata: meta,
        stats: defaultStats,
        erc1155Holders: {
          [lowerCreator]: {
            quantity: supply,
            listings: [],
            auctions: [],
          },
        },
      });
    } else {
      throw new Error("Invalid token data for batch mint");
    }

    if (tokensToCreate.length > 0) {
      await Token.bulkWrite(
        tokensToCreate.map((token) => ({
          updateOne: {
            filter: {
              chainId: token.chainId,
              tokenId: token.tokenId,
              contractType: token.contractType as "ERC721" | "ERC1155",
              contractAddress: token.contractAddress,
            },

            update: {
              $setOnInsert: token as any,
            },
            upsert: true,
          },
        })),
      );
    }

    const collection = await Collection.findOne({ collectionAddress, chainId });
    if (!collection) {
      console.error("Collection not found for event");
      return;
    }
    await Collection.updateOne(
      { collectionAddress, chainId },
      {
        $inc: {
          remainSupply: Number(supply) * -1,
          "stats.items": Number(supply || 1),
        },
      },
    );

    await Event.create({
      entityType: "COLLECTION",
      collectionId: collection._id,

      eventType: "TRANSFER",

      from: "0x0000000000000000000000000000000000000000",
      to: lowerCreator,

      price: 0,
      currency: "ETH",
      quantity: Number(supply || supply),

      txHash: event?.transactionHash?.toLowerCase(),
      blockTimestamp,
    });
  } catch (error) {
    console.error("Error in handleBatchMint:", error);
  }
};

// Now your two functions become simple wrappers
export const handleERC721BatchMinted = async ({ chainId, address, type, event }: Payload) => {
  const { startTokenId, creator, quantity, tokenURI } = event.args;

  await handleBatchMint({
    chainId,
    contract: address,
    type,
    event,
    tokenData: {
      tokenIdStart: Number(startTokenId),
      supply: Number(quantity),
      creator,
      tokenURI,
    },
  });
};

export const handleERC1155BatchMinted = async ({ chainId, address, type, event }: Payload) => {
  const { tokenId, creator, supply, tokenURI } = event.args;

  await handleBatchMint({
    chainId,
    contract: address,
    type,
    event,
    tokenData: {
      tokenId: Number(tokenId),
      supply: Number(supply),
      creator,
      tokenURI,
    },
  });
};
