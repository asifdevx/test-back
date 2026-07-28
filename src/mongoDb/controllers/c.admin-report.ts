import { Request, Response } from "express";
import { StakeEventModel } from "../schemas/sch.StakeEvent";

export const getReports = async (req: Request, res: Response) => {
  try {
    const { search = "", country = "", from, to, page = "1", limit = "20" } = req.query;
  
    
    const numPage = Number(page);
    const numLimit = Number(limit);

    const matchStage: any = {};

    // 🔍 Address search
    if (search) {
      matchStage.address = {
        $regex: (search as string).toLowerCase(),
        $options: "i",
      };
    }

    // 📅 Date filter
    if (from || to) {
      matchStage.date = {};
      if (from) matchStage.date.$gte = new Date(from as string);
      if (to) matchStage.date.$lte = new Date(to as string);
    }

    // 🌍 Country filter
    if (country) {
      matchStage.country = (country as string).toLowerCase();
    }
   
    
    const pipeline: any[] = [
      // 1️⃣ STAKE EVENTS
      {
        $project: {
          address: { $toLower: "$address" },
          type: {
            $cond: [{ $and: [{ $eq: ["$stakeType", "token"] }, { $eq: ["$eventType", "stake"] }] }, "receive", "$eventType"],
          },
          chainId: 1,
          amount: {
            $divide: [{ $toDouble: "$amount" }, 1000000000000000000],
          },
          date: "$timestamp",
          txHash: 1,
          isDoz: { $eq: ["$stakeType", "token"] },
        },
      },

      // 2️⃣ MARKET EVENTS (with $literal fix)
      {
        $unionWith: {
          coll: "events",
          pipeline: [
            { $match: { eventType: { $nin: ["LIKES", "LIST"] } } },
            {
              $project: {
                address: { $toLower: "$from" },
                type: "$eventType",
                chainId: 1,
                amount: "$price",
                date: "$blockTimestamp",
                txHash: 1,
                isDoz: { $literal: false },
              },
            },
          ],
        },
      },

      // 3️⃣ PLATFORM FEES
      {
        $unionWith: {
          coll: "feeevents",
          pipeline: [
            {
              $project: {
                address: { $toLower: "$address" },
                type: "$type",
                chainId: 1,
                amount: {
                  $divide: [{ $toDouble: "$amount" }, 1000000000000000000],
                },
                date: "$createdAt",
                txHash: 1,
                isDoz: "$isDoz",
              },
            },
          ],
        },
      },

      // 🌍 JOIN KYC
      {
        $lookup: {
          from: "kycs",
          let: { addr: "$address" },
          pipeline: [{ $match: { $expr: { $eq: [{ $toLower: "$address" }, "$$addr"] } } }],
          as: "user",
        },
      },

      {
        $addFields: {
          country: {
            $let: {
              vars: { firstUser: { $arrayElemAt: ["$user", 0] } },
              in: { $ifNull: ["$$firstUser.personalInfo.country", ""] },
            },
          },
        },
      },

      // 🔍 APPLY FILTERS
      { $match: matchStage },
           
      // 📊 SORT
      { $sort: { date: -1 } },

      // ♾️ PAGINATION & FINAL DATA SHAPING
      {
        $facet: {
          data: [
            { $skip: (numPage - 1) * numLimit },
            { $limit: numLimit },
            {
              // 🛡️ This stage removes the 'user' array and keeps only what you need
              $project: {
                _id: 1,
                address: 1,
                type: 1,
                chainId: 1,
                txHash: 1,
                amount: 1,
                date: 1,
                country: 1,
                isDoz: 1,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ];

    const result = await StakeEventModel.aggregate(pipeline);

    const data = result[0]?.data || [];
    const total = result[0]?.total[0]?.count || 0;

    return res.json({
      success: true,
      data,
      total,
      page: numPage,
      hasMore: numPage * numLimit < total,
    });
  } catch (error) {
    console.error("Aggregation report error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load reports",
    });
  }
};
