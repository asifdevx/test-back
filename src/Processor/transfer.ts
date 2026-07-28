import { ethers } from "ethers";
import { contracts } from "../config/contract";
import { Collection } from "../mongoDb/schemas/collection.schema";
import { Event } from "../mongoDb/schemas/event.schema";
import { Token } from "../mongoDb/schemas/sch.nft";
import { Profile } from "../mongoDb/schemas/sch.userProfile";
import { Payload } from "../types";

export const handleERC721Transfer = async ({ chainId, address: contract, type, event }: Payload) => {
  try {
    const { from, to, tokenId } = event?.args;
    if (!from || !to) return;
    if (from === ethers.ZeroAddress) {
      return;
    }
    const stakingConfig = contracts.find((e) => e.chainId === chainId && e.type === "STAKING");
    const stakingAddress = stakingConfig?.address?.toLowerCase();

    if (stakingAddress) {
      if (to.toLowerCase() === stakingAddress || from.toLowerCase() === stakingAddress) {
        return;
      }
    }
    const numTokenId = Number(tokenId);

    const contractAddress = (contract as string)?.toLowerCase()?.toLowerCase();

    const txHash = event?.transactionHash;
    const timestamp = Date.now();

    // 🔹 Run DB queries in parallel
    const [token, senderAddress, collection, sellers] = await Promise.all([
      Token.findOneAndUpdate({ contractAddress, chainId, tokenId: numTokenId }, { seller: to?.toLowerCase() }, { new: true }),
      Profile.findOne({ address: from.toLowerCase() }, { _id: 1 }),
      Collection.findOne({ collectionAddress: contractAddress, chainId, contractType: type }, { _id: 1, "stats.floorPrice": 1 }),
      Token.distinct("seller", {
        chainId,
        contractAddress,
        seller: { $exists: true, $ne: null },
      }),
    ]);
    if (collection) {
      const ownersSet = new Set(sellers);
      ownersSet.add(to.toLowerCase());
      await Collection.updateOne({ collectionAddress: contractAddress, chainId }, { $set: { "stats.owners": ownersSet.size } });
    }
    const details = {
      blockTimestamp: timestamp,
      chainId,
      quantity: 1,
      txHash,
      from: from?.toLowerCase(),
      to: to?.toLowerCase(),
      eventType: "TRANSFER",
      price: collection?.stats?.floorPrice || 0,
    };
    if (token) {
      await Event.create([
        { ...details, entityType: "TOKEN", tokenId: token._id },
        { ...details, entityType: "COLLECTION", collectionId: collection?._id },
        { ...details, entityType: "USER", userId: senderAddress?._id },
      ]);
    } else {
      console.warn(`Token not found for tokenId ${numTokenId} on ${contractAddress}`);
    }
  } catch (err) {
    console.error("Error handling ERC721 transfer:", err);
  }
};

export const handleERC1155Transfer = async ({ chainId, address: contract, event }: Payload) => {
  const [operator, from, to, tokenIdBn, qtyBn] = event.args;

  if (from === ethers.ZeroAddress) return;
  if (
    operator.toLowerCase() === contracts.find((e) => e.chainId === chainId && e.type === "STAKING").address.toLowerCase() ||
    from.toLowerCase() === contracts.find((e) => e.chainId === chainId && e.type === "STAKING").address.toLowerCase() ||
    to.toLowerCase() === contracts.find((e) => e.chainId === chainId && e.type === "STAKING").address.toLowerCase()
  ) {
    return;
  }

  const MARKETPLACE_ADDRESS = contracts.find((e) => e.chainId === chainId && e.type === "MARKETPLACE")?.address?.toLowerCase();

  if (operator.toLowerCase() === MARKETPLACE_ADDRESS) return;

  const tokenId = Number(tokenIdBn);
  const quantity = Number(qtyBn);
  const contractAddress = contract?.toLowerCase();
  const timestamp = Date.now();
  const txHash = event?.transactionHash;

  const fromAddr = from.toLowerCase();
  const toAddr = to.toLowerCase();

  const [token, collection, sellerProfile] = await Promise.all([
    Token.findOne({ chainId, contractAddress, tokenId }),
    Collection.findOne({ chainId, collectionAddress: contractAddress }, { _id: 1, "stats.floorPrice": 1 }),
    Profile.findOne({ address: fromAddr }, { _id: 1 }),
  ]);

  if (!token) return;

  // 🔄 Update FROM holder
  const fromQty = (token.erc1155Holders.get(fromAddr)?.quantity || 0) - quantity;

  if (fromQty <= 0) {
    token.erc1155Holders.delete(fromAddr);
  } else {
    token.erc1155Holders.set(fromAddr, {
      holder: fromAddr,
      quantity: fromQty,
    });
  }

  // 🔄 Update TO holder
  token.erc1155Holders.set(toAddr, {
    holder: toAddr,
    quantity: (token.erc1155Holders.get(toAddr)?.quantity || 0) + quantity,
  });

  await token.save();

  // 🔢 Recalculate owners AFTER update
  const tokens = await Token.find({ chainId, contractAddress }, { erc1155Holders: 1 });

  const owners = new Set<string>();
  for (const t of tokens) {
    t.erc1155Holders?.forEach((h) => {
      if (h.quantity > 0) owners.add(h.holder);
    });
  }

  if (collection) {
    await Collection.updateOne({ chainId, collectionAddress: contractAddress }, { $set: { "stats.owners": owners.size } });
  }

  // 🧾 Events
  const baseEvent = {
    chainId,
    from: fromAddr,
    to: toAddr,
    quantity,
    txHash,
    blockTimestamp: timestamp,
    price: collection?.stats?.floorPrice || 0,
    eventType: "TRANSFER",
  };

  await Event.create([
    { ...baseEvent, entityType: "TOKEN", tokenId: token._id },
    { ...baseEvent, entityType: "COLLECTION", collectionId: collection?._id },
    { ...baseEvent, entityType: "USER", userId: sellerProfile?._id },
  ]);
};
