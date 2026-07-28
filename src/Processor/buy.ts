import { ethers } from "ethers";
import { Collection } from "../mongoDb/schemas/collection.schema";
import { Event } from "../mongoDb/schemas/event.schema";
import { Bid } from "../mongoDb/schemas/s.bid";
import { Token } from "../mongoDb/schemas/sch.nft";
import { Profile } from "../mongoDb/schemas/sch.userProfile";
import { Payload } from "../types";

function dayKey(timestamp: number) {
  const d = new Date(timestamp);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

export async function handleBuy({ chainId, event }: Payload) {
  const { makers, taker, __, collectionAddress, supply, tokenIds, prices } = event.args;

  const buyer = taker.toLowerCase();
  const timestamp = Date.now();
  const txHash = event.transactionHash;

  const day = dayKey(timestamp);
  const startOfDay = new Date(Date.UTC(new Date(timestamp).getUTCFullYear(), new Date(timestamp).getUTCMonth(), new Date(timestamp).getUTCDate())).getTime();

  const collectionAddr = collectionAddress.toLowerCase();
  const [buyerProfile, collection] = await Promise.all([Profile.findOne({ address: buyer }).lean(), Collection.findOne({ chainId, collectionAddress: collectionAddr })]);
  if (!buyerProfile) throw new Error("Buyer profile not found");
  if (!collection) return;

  const tokenDocs = await Token.find({
    chainId,
    contractAddress: collectionAddr,
    tokenId: { $in: tokenIds.map(Number) },
  });

  const tokenMap = new Map(tokenDocs.map((t) => [t.tokenId, t]));
  const sellerAddresses = [...new Set(makers.map((m: string) => m.toLowerCase()))];

  const sellerProfiles = await Profile.find({
    address: { $in: sellerAddresses },
  })
    .select("_id address")
    .lean();

  const sellerProfileMap = new Map(sellerProfiles.map((p) => [p.address, p]));
  const eventOps: any[] = [];
  const bulkOps: any[] = [];

  let collectionSales = 0;
  let collectionVolume = 0;
  let floorInvalidated = false;

  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = Number(tokenIds[i]);
    const seller = makers[i].toLowerCase();
    const token = tokenMap.get(tokenId);
    if (!token) continue;

    const isERC1155 = token.contractType === "ERC1155";
    const quantity = isERC1155 ? Number(supply) : 1;
    const price = Number(ethers.formatEther(prices[i]));

    // -- update collection holder and quantity---
    const sellerQty = collection.holders.get(seller) || 0;
    const newSellerQty = sellerQty - quantity;
    if (newSellerQty <= 0) collection.holders.delete(seller);
    else collection.holders.set(seller, newSellerQty);

    const buyerQty = collection.holders.get(buyer) || 0;
    collection.holders.set(buyer, buyerQty + quantity);
    collectionSales += quantity;
    collectionVolume += price * quantity;

    // --- Event Recording ---
    // 1️⃣ Token Event
    eventOps.push({
      entityType: "TOKEN",
      tokenId: token._id,
      eventType: "SALE",
      from: seller,
      chainId: token?.chainId,
      to: buyer,
      price,
      quantity,
      txHash,
      blockTimestamp: timestamp,
    });

    // 2️⃣ Collection Event
    eventOps.push({
      entityType: "COLLECTION",
      collectionId: collection._id,
      eventType: "SALE",
      from: seller,
      chainId: collection?.chainId,
      to: buyer,
      price,
      quantity,
      txHash,
      blockTimestamp: timestamp,
    });

    const sellerProfile = sellerProfileMap.get(seller);

    if (sellerProfile) {
      eventOps.push({
        entityType: "USER",
        userId: sellerProfile._id,
        eventType: "SALE",
        from: seller,
        chainId: collection?.chainId,
        to: buyer,
        price,
        quantity,
        txHash,
        blockTimestamp: timestamp,
      });
    }
    // --- Daily Stats ---
    const daily = token.dailyStats.get(day) || { sales: 0, volume: 0, avgPrice: 0 };
    daily.sales += quantity;
    daily.volume += price * quantity;
    daily.avgPrice = daily.volume / daily.sales;
    token.dailyStats.set(day, daily);

    const update: any = {
      $inc: {
        "stats.totalSales": quantity,
        "stats.totalVolume": price * quantity,
      },
      $push: {
        volumeHistory: { timestamp, price, quantity, eventType: "SALE" },
      },
      $set: {
        dailyStats: token.dailyStats,
      },
    };

    if (isERC1155) {
      const sellerData = token.erc1155Holders.get(seller);
      if (!sellerData) continue;

      let remaining = quantity;

      // --- Auction Priority ---
      if (sellerData.auction?.isListed) {
        const auction = sellerData.auction;
        const used = Math.min(auction.quantity, remaining);
        auction.quantity -= used;
        remaining -= used;

        if (auction.quantity <= 0) {
          await Bid.deleteMany({ auctionRef: auction._id });
          // Reset auction after sale
          sellerData.auction = {
            _id: auction._id,
            minPrice: 0,
            highestBid: 0,
            highestBidder: "",
            endTime: 0,
            quantity: 0,
            isListed: false,
            claimed: false,
            startedAt: 0,
            updatedAt: timestamp,
          };
          floorInvalidated = true;
        } else {
          auction.updatedAt = timestamp;
        }
      }

      // --- Fixed Price ---
      if (remaining > 0 && sellerData.listing?.isListed) {
        const listing = sellerData.listing;
        const used = Math.min(listing.quantity, remaining);
        listing.quantity -= used;
        remaining -= used;

        if (listing.quantity <= 0) {
          sellerData.listing = {
            price: 0,
            quantity: 0,
            isListed: false,
            listedAt: 0,
          };
          floorInvalidated = true;
        }
      }

      if (remaining > 0) continue;

      // --- Update ERC1155 Balances ---
      sellerData.quantity -= quantity;
      if (sellerData.quantity <= 0) {
        token.erc1155Holders.delete(seller);
      } else {
        token.erc1155Holders.set(seller, sellerData);
      }

      const buyerData = token.erc1155Holders.get(buyer) ?? {
        holder: buyer,
        quantity: 0,
        listing: { isListed: false, price: 0, quantity: 0, listedAt: 0 },
        auction: { isListed: false, minPrice: 0, highestBid: 0, highestBidder: "", endTime: 0, quantity: 0, claimed: false, startedAt: 0, updatedAt: 0 },
      };
      buyerData.quantity += quantity;
      token.erc1155Holders.set(buyer, buyerData);

      update.$set.erc1155Holders = token.erc1155Holders;
    } else {
      //-----update collection holder
      const buyerQty = collection.holders.get(buyer) || 0;
      collection.holders.set(buyer, buyerQty + quantity);
      // --- ERC721 ---
      update.$set.seller = buyer;

      if (token.listing?.isListed) {
        update.$set["listing.isListed"] = false;
        update.$set["listing.price"] = 0;
        update.$set["listing.quantity"] = 0;
      }

      if (token.auction?.isListed) {
        update.$set["auction.isListed"] = false;
        update.$set["auction.claimed"] = true;
        update.$set["auction.updatedAt"] = timestamp;
        await Bid.deleteMany({ auctionRef: token._id });
      }

      update.$set["offers.items"] = [];
      floorInvalidated = true;
    }

    bulkOps.push({ updateOne: { filter: { _id: token._id }, update } });
  }

  if (bulkOps.length) {
    const createdEvents = await Event.insertMany(eventOps);
    bulkOps.forEach((op, i) => {
      op.updateOne.update.$push = { events: createdEvents[i]?._id };
    });
    await Token.bulkWrite(bulkOps);
  }

  // --- Collection Stats ---
  const cd = collection.dailyStats.get(day) || { sales: 0, volume: 0, avgPrice: 0 };
  collection.dailyStats.set(day, {
    sales: cd.sales + collectionSales,
    volume: cd.volume + collectionVolume,
    avgPrice: (cd.volume + collectionVolume) / (cd.sales + collectionSales),
  });

  const vh = collection.volumeHistory.find((h) => h.timestamp === startOfDay);
  if (vh) {
    vh.sales += collectionSales;
    vh.volume += collectionVolume;
    vh.avgPrice = vh.volume / vh.sales;
  } else {
    collection.volumeHistory.push({
      timestamp: startOfDay,
      sales: collectionSales,
      volume: collectionVolume,
      avgPrice: collectionVolume / collectionSales,
    });
  }

  collection.stats.totalVolume += collectionVolume;
  collection.stats.allTime.sales += collectionSales;
  collection.stats.allTime.volume += collectionVolume;
  collection.stats.allTime.avgPrice = collection.stats.allTime.volume / collection.stats.allTime.sales;

  // --- Floor Price & Owners ---
  if (floorInvalidated) {
    let floor = Infinity;
    const owners = new Set<string>();

    const tokens = await Token.find({ chainId, contractAddress: collectionAddr }).select("contractType seller listing erc1155Holders");

    for (const t of tokens) {
      if (t.contractType === "ERC721") {
        if (t.listing?.isListed) floor = Math.min(floor, t.listing.price);
        if (t.seller) owners.add(t.seller);
      } else {
        t.erc1155Holders.forEach((h, addr) => {
          owners.add(addr);
          if (h.listing?.isListed) floor = Math.min(floor, h.listing.price);
        });
      }
    }

    collection.stats.floorPrice = floor === Infinity ? 0 : floor;
    collection.stats.owners = owners.size;
  }
  collection.markModified("holders");

  collection.markModified("dailyStats");
  await collection.save();
}
