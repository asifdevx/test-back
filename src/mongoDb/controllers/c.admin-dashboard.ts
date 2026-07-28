import express from "express";
import { Collection } from "../schemas/collection.schema";
import { Event } from "../schemas/event.schema";
import { Token } from "../schemas/sch.nft";
import { User } from "../schemas/sch.userProfile";

export const countMarketplaceStatistic = async (
  req: express.Request,
  res: express.Response
) => {
  // -- user
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    //--- collection
    const totalCollections = await Collection.countDocuments();
    const verifiedCollections = await Collection.countDocuments({
      isVerified: true,
    });

    const totalTokens = await Token.countDocuments();
    const erc721Tokens = await Token.countDocuments({ contractType: "ERC721" });
    const erc1155Tokens = await Token.countDocuments({
      contractType: "ERC1155",
    });

    const activeListings = await Token.countDocuments({
      $or: [{ "listing.isListed": true }, { "auction.isListed": true }],
    });

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const volume24hAgg = await Event.aggregate([
      { $match: { eventType: "SALE", blockTimestamp: { $gte: oneDayAgo } } },
      {
        $group: {
          _id: "$tokenId",
          chainId: { $first: "$chainId" },
          price: { $first: "$price" },
        },
      },
      {
        $group: {
          _id: "$chainId",
          totalVolume: { $sum: "$price" },
        },
      },
    ]);

    const volume24h: Record<number, number> = {};
    volume24hAgg.forEach((v) => {
      volume24h[v._id] = v.totalVolume;
    });

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          verified: verifiedUsers,
          banned: bannedUsers,
        },
        collections: { total: totalCollections, verified: verifiedCollections },
        tokens: {
          total: totalTokens,
          erc721: erc721Tokens,
          erc1155: erc1155Tokens,
        },
        marketplace: { volume24h, activeListings },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSaleOverTime = async (
  req: express.Request,
  res: express.Response
) => {
  try {
    const days = Number(req.query.days) || 30;
    const fromTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;

    const agg = await Event.aggregate([
      {
        $match: {
          eventType: "SALE",
          entityType: "TOKEN",
          blockTimestamp: { $gte: fromTimestamp },
        },
      },

      // 🗓 Group by DAY + CHAIN
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: { $toDate: "$blockTimestamp" },
              },
            },
            chainId: "$chainId",
          },
          saleCount: { $sum: 1 },
        },
      },

      // 🧩 Regroup by DAY
      {
        $group: {
          _id: "$_id.day",
          chains: {
            $push: {
              k: { $toString: "$_id.chainId" },
              v: "$saleCount",
            },
          },
          total: { $sum: "$saleCount" },
        },
      },

      // 🧠 Convert chains array → object
      {
        $addFields: {
          chains: { $arrayToObject: "$chains" },
        },
      },

      { $sort: { _id: 1 } },

      {
        $project: {
          _id: 0,
          date: "$_id",
          total: 1,
          chains: 1,
        },
      },
    ]);

    res.json({ success: true, data: agg });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const collectionByCategory = async (
  req: express.Request,
  res: express.Response
) => {
  try {
    const data = await Collection.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          value: "$count",
        },
      },
      {
        $sort: { value: -1 },
      },
    ]);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Collection category analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch collection category analytics",
    });
  }
};
