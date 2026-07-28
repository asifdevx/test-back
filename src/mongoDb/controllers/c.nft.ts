import { Bid } from "../schemas/s.bid";
import { Token } from "../schemas/sch.nft";

import mongoose from "mongoose";

import { Request, Response } from "express";
import { Collection } from "../schemas/collection.schema";
import { Event } from "../schemas/event.schema";
import { Profile } from "../schemas/sch.userProfile";

import { fixedAlchemyData } from "../../utils/transformAlchemyNFT";

export type ActiveTabProps = "onSale" | "owned" | "created";
type SortType = "recent" | "priceHigh" | "priceLow" | "auctionEnd";

function buildSortQuery(sort: SortType) {
  const map: Record<SortType, any> = {
    recent: { createdAt: -1 },

    priceHigh: { "listing.price": -1 },
    priceLow: { "listing.price": 1 },
    auctionEnd: { "auction.claimed": true },
  };
  return map[sort] || { createdAt: -1 };
}

const buildFilter = ({ filters, chainId, contractAddress }: { filters: any; chainId: number; contractAddress: string }) => {
  const query: any = {
    chainId,
    contractAddress: contractAddress.toLowerCase(),
    $or: [{ isStaked: false }, { isStaked: { $exists: false } }],
  };

  if (filters?.traits && Object.keys(filters.traits).length > 0) {
    const traitConditions = Object.entries(filters.traits)
      .filter(([_, values]) => Array.isArray(values) && values.length > 0)
      .map(([trait, values]) => ({
        attributes: {
          $elemMatch: {
            trait_type: trait,
            value: { $in: values },
          },
        },
      }));

    if (traitConditions.length > 0) {
      query.$and = traitConditions;
    }
  }
  if (filters?.saleType) {
    if (filters.saleType === "fixed") {
      query["listing.isListed"] = true;
    }
    if (filters.saleType === "auction") {
      query["auction.isListed"] = true;
    }
    if (filters.saleType === "not_for_sale") {
      query["listing.isListed"] = false;
      query["auction.isListed"] = false;
    }
  }
  if (filters?.price?.min != null || filters?.price?.max != null) {
    query["listing.price"] = {};
    if (filters.price.min != null) query["listing.price"].$gte = Number(filters.price.min);
    if (filters.price.max != null) query["listing.price"].$lte = Number(filters.price.max);
  }

  return query;
};

const getCollectionNFTs = async (req: Request, res: Response) => {
  const { page = 1, limit = 20, chainId, contractAddress, filters, sort } = req.query;

  if (!chainId || !contractAddress) {
    return res.status(400).json({
      error: "chainId and contractAddress are required",
    });
  }

  try {
    const parsedFilters = typeof filters === "string" ? JSON.parse(filters) : filters;

    const mongoFilter = buildFilter({
      filters: parsedFilters,
      chainId: Number(chainId),
      contractAddress: String(contractAddress).toLowerCase(),
    });

    const sortMap: Record<string, any> = {
      "recently-listed": { "listing.listedAt": -1, _id: -1 },
      "recently-created": { blockTimestamp: -1, _id: -1 },
      "price-low-high": { "listing.price": 1, _id: 1 },
      "price-high-low": { "listing.price": -1, _id: -1 },
      oldest: { createdAt: 1, _id: 1 },
    };

    const sortQuery = sortMap[sort as string] || { createdAt: -1 };
    const pageLimit = Math.min(Number(limit), 100);
    const skip = (Number(page) - 1) * pageLimit;

    const pipeline = [
      { $match: mongoFilter },

      /**
       * 🔄 Normalize ERC1155 → behave like ERC721
       */
      {
        $addFields: {
          activeErc1155Listing: {
            $cond: [
              { $eq: ["$contractType", "ERC1155"] },
              {
                $first: {
                  $filter: {
                    input: { $objectToArray: "$erc1155Holders" },
                    as: "holder",
                    cond: {
                      $or: [{ $eq: ["$$holder.v.listing.isListed", true] }, { $eq: ["$$holder.v.auction.isListed", true] }],
                    },
                  },
                },
              },
              null,
            ],
          },
        },
      },

      /**
       * 🎯 Resolve seller + listing + auction
       */
      {
        $addFields: {
          seller: {
            $cond: [{ $eq: ["$contractType", "ERC1155"] }, "$activeErc1155Listing.v.holder", "$seller"],
          },
          listing: {
            $cond: [{ $eq: ["$contractType", "ERC1155"] }, "$activeErc1155Listing.v.listing", "$listing"],
          },
          auction: {
            $cond: [{ $eq: ["$contractType", "ERC1155"] }, "$activeErc1155Listing.v.auction", "$auction"],
          },
        },
      },

      { $sort: sortQuery },

      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: pageLimit },

            /**
             * 👤 Creator profile
             */
            {
              $lookup: {
                from: "profiles",
                let: { creator: "$creator" },
                pipeline: [{ $match: { $expr: { $eq: ["$address", "$$creator"] } } }, { $project: { _id: 0, displayName: 1, avatarUrl: 1 } }],
                as: "creatorProfile",
              },
            },
            {
              $set: {
                creatorProfile: { $arrayElemAt: ["$creatorProfile", 0] },
              },
            },

            /**
             * 👤 Seller profile
             */
            {
              $lookup: {
                from: "profiles",
                let: { seller: "$seller" },
                pipeline: [{ $match: { $expr: { $eq: ["$address", "$$seller"] } } }, { $project: { _id: 0, displayName: 1, avatarUrl: 1 } }],
                as: "sellerProfile",
              },
            },
            {
              $set: { sellerProfile: { $arrayElemAt: ["$sellerProfile", 0] } },
            },

            /**
             * 📦 Final payload
             */
            {
              $project: {
                _id: 1,
                tokenId: 1,
                name: 1,
                image: 1,
                chainId: 1,
                contractAddress: 1,
                contractType: 1,
                supply: 1,
                createdAt: 1,
                blockTimestamp: 1,
                creator: 1,
                seller: 1,
                listing: 1,
                auction: 1,
                creatorProfile: 1,
                sellerProfile: 1,
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await Token.aggregate(pipeline);

    const nfts = result?.data ?? [];
    const total = result?.totalCount?.[0]?.count ?? 0;

    return res.status(200).json({
      data: nfts,
      page: Number(page),
      limit: pageLimit,
      total,
      hasMore: skip + nfts.length < total,
    });
  } catch (error) {
    console.error("getCollectionNFTs error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getNftsById = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No NFT ids provided" });
    }

    // ✅ Validate ObjectIds
    const objectIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

    if (objectIds.length === 0) {
      return res.status(400).json({ message: "Invalid NFT ids" });
    }

    // ✅ Fetch NFTs
    const nfts = await Token.find({
      _id: { $in: objectIds },
    })
      .select("_id name seller image tokenId chainId listing contractType")
      .lean();

    // ✅ Preserve original order
    const nftMap = new Map(nfts.map((nft) => [nft._id.toString(), nft]));
    const orderedNfts = ids.map((id) => nftMap.get(id)).filter(Boolean);

    return res.status(200).json(orderedNfts);
  } catch (error) {
    console.error("getNftsById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
const handleBatchList = async (req: Request, res: Response) => {
  try {
    const { nfts, userAddress } = req.body;

    if (!userAddress) {
      return res.status(400).json({ success: false, error: "User address required" });
    }
    if (!Array.isArray(nfts) || nfts.length === 0) {
      return res.status(400).json({ success: false, error: "No NFTs provided" });
    }

    const lister = userAddress?.toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    // Fetch profile once
    const profile = await Profile.findOne({ address: lister })
      .select("_id")

      .lean();

    if (!profile) throw new Error("Profile not found");

    // Fetch first token → collection

    const firstToken = await Token.findById(nfts[0].id).select("contractAddress chainId");

    if (!firstToken) throw new Error("Token not found");

    const collection = await Collection.findOne({
      collectionAddress: firstToken?.contractAddress?.toLowerCase(),
      chainId: firstToken.chainId,
    });

    if (!collection) throw new Error("Collection not found");

    const bulkOps: any[] = [];
    const eventOps: any[] = [];

    for (const nft of nfts) {
      if (!nft.id || typeof nft.price !== "number" || nft.price <= 0) {
        throw new Error("Invalid NFT ID or price");
      }

      // --- Listing / Auction ---
      if (nft.endTime && nft.endTime > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: nft.id },
            update: {
              $set: {
                auction: {
                  minPrice: nft.price,
                  highestBid: 0,
                  endTime: nft.endTime,
                  quantity: 1,
                  isListed: true,
                  claimed: false,
                  startedAt: now,
                  updatedAt: now,
                },
              },
            },
          },
        });
      } else {
        bulkOps.push({
          updateOne: {
            filter: { _id: nft.id },
            update: {
              $set: {
                listing: {
                  price: nft.price,
                  quantity: 1,
                  isListed: true,
                  listedAt: now,
                },
              },
            },
          },
        });
      }

      // --- EVENTS ---

      const commonEvent = {
        from: lister,
        price: nft.price,
        chainId: firstToken.chainId,
        blockTimestamp: now,
        eventType: "LIST",
      };

      eventOps.push({ ...commonEvent, entityType: "TOKEN", tokenId: nft.id });
      eventOps.push({
        ...commonEvent,
        entityType: "USER",
        userId: profile._id,
        metadata: { tokenId: nft.id },
      });
      eventOps.push({
        ...commonEvent,
        entityType: "COLLECTION",
        collectionId: collection._id,
        metadata: { tokenId: nft.id },
      });
    }

    // --- Write operations ---
    await Promise.all([Token.bulkWrite(bulkOps), Event.insertMany(eventOps)]);

    // --- Update floor price ---
    const batchMinPrice = Math.min(...nfts.map((n) => n.price));

    if (collection.stats.floorPrice === 0 || batchMinPrice < collection.stats.floorPrice) {
      collection.stats.floorPrice = batchMinPrice;
      await collection.save();
    }

    return res.json({ success: true, message: "NFTs listed successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const handleBatchUnlistNFTs = async (req: Request, res: Response) => {
  try {
    const { nfts } = req.body;
    if (!Array.isArray(nfts) || nfts.length === 0) {
      return res.status(400).json({ success: false, error: "No nfts provided for unlisting" });
    }
    const ids = nfts.map((nft) => nft.id);

    await Token.updateMany({ _id: { $in: ids } }, { $set: { "listing.price": 0, "listing.isListed": false } });

    return res.json({ success: true, message: "NFTs unlisted successfully" });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const handleSinglelistNFT = async (req: Request, res: Response) => {
  try {
    const { id, price, endTime, quantity, owner } = req.body;

    if (!id || typeof price !== "number" || price <= 0) {
      return res.status(400).json({ success: false, error: "Invalid NFT id or price" });
    }

    const token = await Token.findById(id);
    if (!token) {
      return res.status(404).json({ success: false, error: "NFT not found" });
    }

    const now = Math.floor(Date.now() / 1000);
    const listOwner = (owner || token.seller).toLowerCase();

    // ================= ERC1155 =================
    if (token.contractType === "ERC1155") {
      const qty = Math.max(1, Number(quantity));
      const holder = token.erc1155Holders.get(listOwner);

      if (!holder || holder.quantity < qty) {
        return res.status(400).json({ success: false, error: "Insufficient balance" });
      }

      if (endTime && endTime > 0) {
        holder.auction = {
          minPrice: price,
          highestBid: 0,
          highestBidder: "",
          endTime,
          quantity: qty,
          isListed: true,
          claimed: false,
          startedAt: now,
          updatedAt: now,
        };

        await Bid.create([{ contractType: "ERC1155", auctionRef: holder.auction._id }]);
      } else {
        holder.listing = {
          price,
          quantity: qty,
          isListed: true,
          listedAt: now,
        };
      }

      token.erc1155Holders.set(listOwner, holder);
      token.markModified("erc1155Holders");
    }

    // ================= ERC721 =================
    else {
      if (endTime && endTime > 0) {
        token.auction = {
          minPrice: price,
          highestBid: 0,
          endTime,
          quantity: 1,
          isListed: true,
          claimed: false,
          startedAt: now,
          updatedAt: now,
        };

        if (token.listing) token.listing.isListed = false;
        else token.listing = { price: 0, quantity: 1, isListed: false, listedAt: now };

        await Bid.create([{ contractType: "ERC721", auctionRef: token._id }]);
      } else {
        token.listing = {
          price,
          quantity: 1,
          isListed: true,
          listedAt: now,
        };
        if (token.auction) token.auction.isListed = false;
      }
    }

    await token.save();

    // ================= EVENTS =================

    const profile = await Profile.findOne({ address: listOwner })
      .select("_id")

      .lean();

    const collection = await Collection.findOne({
      collectionAddress: token?.contractAddress?.toLowerCase(),
      chainId: token.chainId,
    }).select("_id stats.floorPrice");

    const events = [
      // NFT Activity
      {
        entityType: "TOKEN",
        tokenId: token._id,
        eventType: "LIST",
        from: listOwner,
        price,
        quantity: 1,
        chainId: token.chainId,
        blockTimestamp: now,
      },

      // Profile Activity
      {
        entityType: "USER",
        userId: profile?._id,
        eventType: "LIST",
        from: listOwner,
        price,
        quantity: 1,
        chainId: token.chainId,
        blockTimestamp: now,
        metadata: { tokenId: token._id },
      },

      // Collection Activity
      {
        entityType: "COLLECTION",
        collectionId: collection?._id,
        eventType: "LIST",
        from: listOwner,
        price,
        quantity: 1,
        chainId: token.chainId,
        blockTimestamp: now,
        metadata: { tokenId: token._id },
      },
    ];

    await Event.insertMany(events);

    // ================= FLOOR PRICE =================
    if (collection && (collection.stats.floorPrice === 0 || price < collection.stats.floorPrice)) {
      collection.stats.floorPrice = price;
      await collection.save();
    }

    return res.json({ success: true, message: "NFT listed successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const handleSingleUnlistNFT = async (req: Request, res: Response) => {
  try {
    const { id, owner } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "NFT id is required" });
    }

    const token = await Token.findById(id);
    if (!token) {
      return res.status(404).json({ success: false, error: "NFT not found" });
    }

    // ================= ERC1155 =================
    if (token.contractType === "ERC1155") {
      const addr = owner?.toLowerCase();
      if (!addr) {
        return res.status(400).json({ success: false, error: "Owner required for ERC1155" });
      }

      const holder = token.erc1155Holders.get(addr);
      if (!holder) {
        return res.status(404).json({ success: false, error: "Holder not found" });
      }

      if (!holder.listing && !holder.auction) {
        return res.status(409).json({ success: false, error: "Nothing listed" });
      }

      if (holder.auction?.isListed) {
        await Bid.deleteMany({ auctionRef: holder.auction._id });
      }

      // ---- CLEAR LISTINGS ----
      if (holder.listing) {
        holder.listing.isListed = false;
      }
      if (holder.auction) {
        holder.auction.isListed = false;
      }

      // ---- CLEAR AUCTIONS + DELETE BIDS ----
      token.erc1155Holders.set(addr, holder);
      token.markModified("erc1155Holders");
      await token.save();
    }

    // ================= ERC721 =================
    else {
      if (!token.listing?.isListed && !token.auction?.isListed) {
        return res.status(409).json({ success: false, error: "NFT not listed" });
      }

      // ---- DELETE AUCTION BIDS ----
      if (token.auction?.isListed) {
        await Bid.deleteMany({ auctionRef: token._id });
      }

      token.listing = {
        isListed: false,
        price: 0,
        quantity: 1,
        listedAt: 0,
      };

      token.auction = {
        minPrice: 0,
        highestBid: 0,
        highestBidder: undefined,
        quantity: 0,
        endTime: 0,
        isListed: false,
        claimed: false,
        startedAt: 0,
        updatedAt: Date.now(),
      };

      await token.save();
    }
    const contractAddress = token?.contractAddress?.toLowerCase();
    
    // ================= FLOOR RECALC =================
    const collection = await Collection.findOne({
      chainId: token.chainId,
      collectionAddress: contractAddress,
    });

    if (collection) {
      let floor = Infinity;

      const tokens = await Token.find({
        chainId: token.chainId,
        contractAddress,
      }).select("contractType listing erc1155Holders");

      for (const t of tokens) {
        if (t.contractType === "ERC721") {
          if (t.listing?.isListed) floor = Math.min(floor, t.listing.price??0);
        } else {
          t.erc1155Holders.forEach((h) => {
            if (h.listing?.isListed) {
              floor = Math.min(floor, h.listing.price??0);
            }
          });
        }
      }

      collection.stats.floorPrice = floor === Infinity ? 0 : floor;
      await collection.save();
    }

    return res.json({ success: true, message: "NFT unlisted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

//! -------------- nft page --------

const getSingleNftsDetails = async (req: Request, res: Response) => {
  const { chainId, contractAddress, tokenId } = req.query;

  // 1️⃣ Validate query params
  if (!chainId || !contractAddress || !tokenId) {
    return res.status(400).json({
      error: "chainId, contractAddress and tokenId are required",
    });
  }

  const address = (contractAddress as string).toLowerCase();

  try {
    // 2️⃣ Fetch NFT (exclude heavy fields)
    const token = await Token.findOne(
      {
        chainId: Number(chainId),
        contractAddress: address,
        tokenId: Number(tokenId),
      },
      {
        stats: 0,
      },
    ).populate("events");

    if (!token) {
      return res.status(404).json({ error: "NFT not found" });
    }

    // 3️⃣ Prepare profile queries
    const creatorQuery = Profile.findOne({ address: token.creator }, { displayName: 1, avatarUrl: 1, verified: 1 });

    const sellerQuery = token.creator !== token.seller ? Profile.findOne({ address: token.seller }, { displayName: 1, avatarUrl: 1, verified: 1 }) : null;

    // 4️⃣ Fetch collection + profiles in parallel
    const [collection, sellerProfile, creatorProfile] = await Promise.all([
      Collection.findOne({ chainId: Number(chainId), collectionAddress: address }, { _id: 1, slug: 1, royaltyFee: 1, isVerified: 1, avatarUrl: 1 }),
      sellerQuery,
      creatorQuery,
    ]);

    // 5️⃣ Final response
    return res.status(200).json({
      token,
      collection,
      users: {
        creator: creatorProfile,
        seller: sellerProfile,
      },
    });
  } catch (error) {
    console.error("NFT DETAILS ERROR:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getTopAuctionNFTs = async (_req: Request, res: Response) => {
  try {
    const topNFTs = await Token.aggregate([
      {
        $match: {
          "auction.isListed": true,
          "auction.endTime": { $gt: Math.floor(Date.now() / 1000) }, // 🔥 live only
        },
      },
      {
        $sort: {
          "auction.startedAt": -1,
          "auction.updatedAt": -1,
        },
      },
      {
        $limit: 8,
      },

      {
        $lookup: {
          from: "profiles",
          localField: "creator",
          foreignField: "address",
          as: "creatorProfile",
        },
      },
      {
        $unwind: {
          path: "$creatorProfile",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔹 Seller Profile
      {
        $lookup: {
          from: "profiles",
          localField: "seller",
          foreignField: "address",
          as: "sellerProfile",
        },
      },
      {
        $unwind: {
          path: "$sellerProfile",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "collections",
          localField: "contractAddress",
          foreignField: "collectionAddress",
          as: "collection",
        },
      },
      { $unwind: { path: "$collection", preserveNullAndEmptyArrays: true } },
      // 🔹 Shape response
      {
        $project: {
          name: 1,
          image: 1,
          auction: 1,
          tokenId: 1,
          chainId: 1,
          contractAddress: 1,

          creator: {
            address: "$creator",
            name: "$creatorProfile.displayName",
            avatar: "$creatorProfile.avatarUrl",
            verified: "$creatorProfile.verified",
          },

          seller: {
            address: "$seller",
            name: "$sellerProfile.displayName",
            avatar: "$sellerProfile.avatarUrl",
            verified: "$sellerProfile.verified",
          },
          collectionAvatar: "$collection.avatarUrl",
        },
      },
    ]);

    return res.json({ success: true, topNFTs });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const fixedNftDetails = async (req: Request, res: Response) => {
  const { chainId, contractAddress, tokenId } = req.body;

  if (!chainId || !contractAddress || !tokenId) {
    return res.status(400).json({
      error: "chainId, contractAddress and tokenId are required",
    });
  }
  try {
    const token = await Token.findOne({
      chainId: Number(chainId),
      contractAddress: contractAddress.toString().toLowerCase(),
      tokenId: Number(tokenId),
    });
    if (!token) {
      return res.status(404).json({
        success: false,
        message: "NFT not found in database",
      });
    }

    const updateData = await fixedAlchemyData({
      chainId: Number(chainId),
      contractAddress: contractAddress.toString().toLowerCase(),
      tokenId: Number(tokenId),
    });

    await Token.updateOne({ _id: token._id }, { $set: updateData });

    return res.json({
      success: true,
      message: "NFT metadata fetched from Alchemy and updated successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to sync NFT metadata",
    });
  }
};

const extraVolume = async (req: Request, res: Response) => {
  try {
    const { collectionAddress, chainId, amount } = req.body;

    if (!collectionAddress || !chainId || !amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    const formattedAddress = collectionAddress.toLowerCase();

    // 1. Find the collection
    const collection = await Collection.findOne({
      collectionAddress: formattedAddress,
      chainId,
    }).select("stats");

    if (!collection) {
      return res.status(404).json({ message: "Collection not found" });
    }

    const floorPrice = collection.stats?.floorPrice || 0;
    const extraVol = floorPrice * amount;

    // 2. Fetch all tokens for this collection to sync holders
    const tokens = await Token.find({
      contractAddress: formattedAddress,
      chainId,
    });

    // 3. Rebuild the holders map dynamically
    const newHolders: Record<string, number> = {};

    tokens.forEach((token) => {
      const owner = token.seller?.toLowerCase();
      if (owner) {
        newHolders[owner] = (newHolders[owner] || 0) + 1;
      }
    });

    // 4. Calculate total unique owners
    const totalUniqueOwners = Object.keys(newHolders).length;

    // 5. Update volume, owners count, and the holders map in one go
    await Collection.updateOne(
      { collectionAddress: formattedAddress, chainId },
      {
        $inc: {
          "stats.totalVolume": extraVol,
          "stats.allTime.volume": extraVol,
        },
        $set: {
          "stats.owners": totalUniqueOwners,
          holders: newHolders,
        },
      },
    );

    return res.json({
      success: true,
      floorPrice,
      amount,
      extraVolume: extraVol,
      stats: {
        ownersSynced: totalUniqueOwners,
      },
    });
  } catch (err) {
    console.error("extraVolume error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export {
  buildSortQuery,
  extraVolume,
  fixedNftDetails,
  getCollectionNFTs,
  getNftsById,
  getSingleNftsDetails,
  getTopAuctionNFTs,
  handleBatchList,
  handleBatchUnlistNFTs,
  handleSinglelistNFT,
  handleSingleUnlistNFT
};

