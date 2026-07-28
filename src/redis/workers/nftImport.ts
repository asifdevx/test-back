import axios from "axios";
import { Job, Worker } from "bullmq";
import pLimit from "p-limit";
import { singleKey } from "../../config/chainId";

import { Collection } from "../../mongoDb/schemas/collection.schema";
import { Token } from "../../mongoDb/schemas/sch.nft";
import delay from "../../utils/delay";
import { IPFS_GATEWAYS } from "../../utils/fallBackIpfs";
import { redisConnection } from "../../config/redis";

export const resolveIpfsImage = async (uri: string | null): Promise<string> => {
  if (!uri) return "";
  if (!uri.startsWith("ipfs://")) return uri;

  const cidPath = uri.replace("ipfs://", "");

  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = `${gateway}/${cidPath}`;
      await axios.head(url, { timeout: 3000 });
      return url;
    } catch {
      continue;
    }
  }
  return `https://ipfs.io/ipfs/${cidPath}`;
};

const calculateCollectionStats = async (collectionAddress: string, chainId: number) => {
  const stats = await Token.aggregate([
    {
      $match: {
        chainId,
        contractAddress: collectionAddress,
      },
    },
    {
      $group: {
        _id: "$seller",
        count: { $sum: 1 },
      },
    },
  ]);

  const holdersMap: Record<string, number> = {};
  stats.forEach((s) => {
    if (s._id) holdersMap[s._id] = s.count;
  });

  const totalItems = await Token.countDocuments({
    chainId,
    contractAddress: collectionAddress,
  });

  const totalOwners = stats.length;

  await Collection.updateOne(
    { chainId, collectionAddress },
    {
      $set: {
        "stats.owners": totalOwners,
        "stats.items": totalItems,
        holders: holdersMap,
      },
    },
  );

  console.info(`🎉 Done! Owners: ${totalOwners}, Items: ${totalItems}`);
};
const limit = pLimit(20);

new Worker(
  "nft-import-queue",
  async (job: Job) => {
    const { base, chainId, collectionAddress, startId } = job.data;
    let currentTokenId = startId;
    const pageSize = 100;
    let totalProcessed = 0;

    console.info(`🚀 Starting job for collection ${collectionAddress} from ID ${startId}`);

    try {
      while (true) {
        let nfts: any[] = [];

        try {
          const url = new URL(
            `https://${base}.g.alchemy.com/nft/v3/${singleKey}/getNFTsForCollection?contractAddress=${collectionAddress}&withMetadata=true&startToken=${currentTokenId}&limit=${pageSize}&tokenUriTimeoutInMs=0`,
          );

          const res = await axios.get(url.toString());
          nfts = res.data.nfts || [];
        } catch (err: any) {
          console.error("❌ Failed to fetch NFTs:", err?.message);
          throw err; // 🔥 important → fail job properly
        }

        if (nfts.length === 0) break;

        // ✅ safe creator
        const creator = nfts[0]?.contract?.contractDeployer?.toLowerCase() || "";

        const operationsPromises = nfts.map((nft: any) =>
          limit(async () => {
            const tokenId = nft.tokenId;

            let seller = "unknown";

            try {
              const ownerUrl = `https://${base}.g.alchemy.com/nft/v3/${singleKey}/getOwnersForNFT?contractAddress=${collectionAddress}&tokenId=${tokenId}`;
              const ownerRes = await axios.get(ownerUrl);
              seller = ownerRes.data.owners?.[0] || "unknown";

              await delay(50);
            } catch (err: any) {
              console.warn(`⚠️ Owner fetch failed for token ${tokenId}: ${err?.message}`);
            }

            try {
              const image = await resolveIpfsImage(nft?.raw?.metadata?.image || nft?.image?.originalUrl);

              const transformedNft = {
                chainId,
                contractAddress: collectionAddress,
                contractType: nft.tokenType,
                creator,
                tokenId: Number(tokenId),
                name: nft.name || nft.raw?.metadata?.name || null,
                description: nft.description || nft.raw?.metadata?.description || null,
                image,
                attributes: nft.raw?.metadata?.attributes || [],
                metadata: nft.raw?.metadata || {},
                seller: seller.toLowerCase(),
              };

              const { seller: sellerField, ...rest } = transformedNft;

              return {
                updateOne: {
                  filter: {
                    chainId,
                    contractAddress: collectionAddress,
                    tokenId: transformedNft.tokenId,
                  },
                  update: {
                    $set: { seller: sellerField },
                    $setOnInsert: rest,
                  },
                  upsert: true,
                },
              };
            } catch (err: any) {
              console.error(`❌ NFT transform failed for token ${tokenId}:`, err?.message);
              return null; // skip this NFT
            }
          }),
        );

        const results = await Promise.all(operationsPromises);
        const bulkOps = results.filter(Boolean);

        if (bulkOps.length > 0) {
          try {
            await Token.bulkWrite(bulkOps);
          } catch (error: any) {
            console.error("❌ Bulk write failed:", error?.message);
            throw error; // 🔥 fail job
          }
        }

        totalProcessed += nfts.length;

        if (totalProcessed % 100 === 0) {
          console.info(`✅ Processed ${totalProcessed} NFTs for ${collectionAddress}`);
        }

        const lastTokenInBatch = Number(nfts[nfts.length - 1].tokenId);
        currentTokenId = lastTokenInBatch + 1;

        await delay(500);
      }

      // ✅ stats update
      try {
        await calculateCollectionStats(collectionAddress, chainId);
      } catch (err: any) {
        console.error("❌ Stats calculation failed:", err?.message);
      }

      console.info(`🎉 Job completed for ${collectionAddress}`);
    } catch (err: any) {
      console.error("🔥 Worker failed:", err?.message);
      throw err; // 🔥 VERY IMPORTANT (marks job as failed in BullMQ)
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);
