import { Request, Response } from "express";
import { Event } from "../schemas/event.schema";
import { StakeEventModel, StakeEventType, StakeType } from "../schemas/sch.StakeEvent";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
import { User } from "../schemas/sch.userProfile";

/**
 * GET /admin/users
 * Fetch users with search & role filter (for infinite scroll)
 * query: search, role, page, limit
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || "";
    const country = (req.query.country as string) || "";
    const role = (req.query.role as string) || "all";
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string) || 15, 1);

    const skip = (page - 1) * limit;

    const match: any = {};

    if (role !== "all") {
      match.role = role;
    }

    const pipeline: any[] = [
      { $match: match },

      // 👤 profile
      {
        $lookup: {
          from: "profiles",
          localField: "profile",
          foreignField: "_id",
          as: "profile",
        },
      },
      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },

      // 🧾 kyc
      {
        $lookup: {
          from: "kycs",
          localField: "kyc",
          foreignField: "_id",
          as: "kyc",
        },
      },
      { $unwind: { path: "$kyc", preserveNullAndEmptyArrays: true } },

      // 🔥 subscription
      {
        $lookup: {
          from: "subscriptions",
          localField: "address",
          foreignField: "address",
          as: "subscription",
        },
      },
      {
        $unwind: {
          path: "$subscription",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🎯 FINAL PACKAGE OUTPUT (ONLY IDS)
      {
        $addFields: {
          packages: {
            nft: {
              $ifNull: ["$subscription.packages.nft.pkgId", 0],
            },
            business: {
              $ifNull: ["$subscription.packages.business.pkgId", 0],
            },
          },
        },
      },
    ];

    // 🔍 search
    if (search.trim()) {
      pipeline.push({
        $match: {
          $or: [{ address: { $regex: search, $options: "i" } }, { name: { $regex: search, $options: "i" } }, { "profile.email": { $regex: search, $options: "i" } }],
        },
      });
    }

    // 🌍 country filter
    if (country.trim()) {
      pipeline.push({
        $match: {
          "kyc.personalInfo.country": {
            $regex: country,
            $options: "i",
          },
        },
      });
    }

    // pagination
    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    );

    const result = await User.aggregate(pipeline);

    const users = result[0]?.data || [];
    const total = result[0]?.total[0]?.count || 0;

    res.json({
      data: users,
      pagination: {
        total,
        page,
        limit,
        hasMore: skip + users.length < total,
      },
    });
  } catch (error) {
    console.error("handleAllUsers error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

/**
 * PATCH /admin/users/verify
 * Verify / unverify user
 * body: { userId }
 */
export const handleToggleVerified = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isVerified = !user.isVerified;
    await user.save();

    res.json({ success: true, isVerified: user.isVerified });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /admin/users/ban
 * Ban / unban user
 * body: { userId }
 */
export const handleToggleBan = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isBanned = !user.isBanned;
    await user.save();

    res.json({ success: true, isBanned: user.isBanned });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /admin/users/package
 * Update user package
 * body: { userId, packageId }
 */
export const handleuserPkg = async (req: Request, res: Response) => {
  try {
    const { userId, packageId, mode } = req.body as { userId: string; packageId: 0 | 1 | 2 | 3; mode: "nft" | "business" };
  
    
    if (!userId || packageId === undefined || !mode) {
      return res.status(400).json({ error: "userId, packageId & mode required" });
    }

    if (!["nft", "business"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const address = user.address.toLowerCase();
    
    
    // 🔥 get existing subscription
    const existing = await SubscriptionModel.findOne({ address });

    let baseDate = new Date();

    // ✅ ALWAYS extend from expiry if exists
    if (existing?.packages?.[mode]?.expireAt) {
      baseDate = new Date(existing.packages[mode].expireAt);
    }

    const newExpire = new Date(baseDate);
    newExpire.setMonth(newExpire.getMonth() + 1);

    // 🔥 upsert subscription
    const updatedSub = await SubscriptionModel.findOneAndUpdate(
      { address },
      {
        $set: {
          [`packages.${mode}`]: {
            pkgId: Number(packageId),
            expireAt: newExpire,
          },
        },
      },
      { upsert: true, new: true },
    );
    
    
    res.json({
      success: true,
      package: packageId,
      mode,
      expireAt: newExpire,
      subscription: updatedSub,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};
/**
 * DELETE /admin/users
 * Delete user (if needed)
 * body: { userId }
 */
export const handleDeleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) return res.status(404).json({ error: "User not found" });

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};
/**
 * get /admin/user/activity
 * get user tx activity
 * query: { id }
 */
export const getUserActivity = async (req: Request, res: Response) => {
  const { page = "1", limit = "10", id, address } = req.query;

  try {
    if (!id || !address) {
      return res.status(400).json({
        success: false,
        message: "id and address required",
      });
    }

    const numPage = Number(page);
    const numLimit = Number(limit);

    // 1️⃣ Marketplace Events
    const marketEvents = await Event.find({
      userId: id,
      eventType: { $nin: ["LIKES", "LIST"] },
    })
      .populate("metadata.tokenId", "name")
      .lean();

    // 2️⃣ Staking Events
    const stakeEvents = await StakeEventModel.find({
      address: (address as string).toLowerCase(),
    }).lean();

    // 3️⃣ Normalize Marketplace
    const formattedMarket = marketEvents.map((e) => ({
      type: e.eventType,
      chainId: e.chainId,
      amount: e.price || 0,
      date: new Date(e.blockTimestamp),
      meta: {
        from: e.from,
        to: e.to,
        token: e?.metadata?.tokenId?.name || null,
      },
    }));

    const formattedStake = stakeEvents.map((e) => {
      const isDoz = e.stakeType === StakeType.TOKEN;

      let type: "stake" | "unbond" | "claim" | "receive" = e.eventType;

      // Only modify for DOZ (ERC20)
      if (isDoz) {
        if (e.eventType === StakeEventType.STAKE) {
          type = "receive";
        }
      }

      return {
        type,
        chainId: e.chainId,
        amount: Number(e.amount),
        date: e.timestamp,
        isDoz,
        meta: {
          stakeType: e.stakeType,
        },
      };
    });

    // 5️⃣ Merge + Sort
    const merged = [...formattedMarket, ...formattedStake].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 6️⃣ Pagination (after merge)
    const start = (numPage - 1) * numLimit;
    const paginated = merged.slice(start, start + numLimit);

    return res.json({
      success: true,
      data: paginated,
      total: merged.length,
      page: numPage,
      hasMore: start + numLimit < merged.length,
    });
  } catch (error) {
    console.error("User activity error:", error);
    res.status(500).json({ message: "Failed to load activity" });
  }
};
