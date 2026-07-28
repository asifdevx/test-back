import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { createRecurring } from "../../utils/createRecurringPayment";
import { generateKey, hashValue } from "../../utils/genaretKey";
import { Kyc } from "../schemas/kyc.schema";
import { BusinessKyc } from "../schemas/sch.businessKyc";
import { PayConfig } from "../schemas/sch.payConfig";
import { PaySubscriptionTxModel, SubscriptionStatus } from "../schemas/sch.paySubscription";
import { PayTx } from "../schemas/sch.payTx";
import { Pricing } from "../schemas/sch.pricing";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
import { Profile } from "../schemas/sch.userProfile";
type ChartDataItem = {
  chainId: number;
  [token: string]: number | string;
};

async function isAddressUnique(address: string) {
  const exists = await PayConfig.findOne({
    $or: [{ creatorAddress: address }, { "directors.address": address, "directors.isApproved": true }],
  });

  return !exists;
}

export async function getStats(req: Request, res: Response) {
  try {
    const address = (req.query.address as string)?.toLowerCase();

    if (!address) {
      return res.status(400).json({ error: "address is required" });
    }

    // ✅ 1. Find config (creator OR approved director)
    const config = await PayConfig.findOne({
      $or: [
        { creatorAddress: address },
        {
          directors: {
            $elemMatch: {
              address,
              isApproved: true,
            },
          },
        },
      ],
    }).lean();

    if (!config) {
      return res.status(404).json({ error: "Active config not found" });
    }

    // ✅ 2. Pricing
    const pricing = await Pricing.findOne({
      mode: "business",
      pkgId: config.pkgId ?? 0,
    }).lean();

    const txCount = config.txCount ?? 0;
    const fee = pricing?.fee ?? 0;
    // ✅ 3. Last 30 days aggregation
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const stats = await PayTx.aggregate([
      {
        $match: {
          merchantId: config._id,
          createdAt: { $gte: last30Days },
          senderAddress: { $ne: null }, // optional but cleaner
        },
      },
      {
        $group: {
          _id: null,
          totalTx: { $sum: 1 },
          successTx: {
            $sum: {
              $cond: [{ $eq: ["$status", "success"] }, 1, 0],
            },
          },
          uniqueSenders: { $addToSet: "$senderAddress" },
        },
      },
      {
        $project: {
          _id: 0,
          totalTx: 1,
          successTx: 1,
          uniqueSenderCount: { $size: "$uniqueSenders" },
          uptime: {
            $cond: [
              { $eq: ["$totalTx", 0] },
              0,
              {
                $multiply: [{ $divide: ["$successTx", "$totalTx"] }, 100],
              },
            ],
          },
        },
      },
    ]);
    const result = stats[0] || {
      totalTx: 0,
      successTx: 0,
      uniqueSenderCount: 0,
      uptime: 0,
    };

    return res.status(200).json({
      txCount,
      fee,
      uniqueSenderCount: result.uniqueSenderCount,
      uptime: result.uptime,
    });
  } catch (error) {
    console.info("Failed to get Stats for merchant", error);
  }
}
export async function getAllChartData(req: Request, res: Response) {
  const { address, range = "monthly" } = req.query as {
    address: string;
    range: "monthly" | "yearly";
  };

  if (!address) {
    return res.status(400).json({ message: "Address required" });
  }
  try {
    const wallet = address.toLowerCase();

    // ✅ 1. Get all accessible configs
    const config = await PayConfig.findOne({
      $or: [
        { creatorAddress: wallet },
        {
          directors: {
            $elemMatch: {
              address: wallet,
              isApproved: true,
            },
          },
        },
      ],
    }).select("_id");

    if (!config) {
      return res.status(404).json({ message: "No configs found" });
    }

    const now = new Date();

    const fromDate = range === "monthly" ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()) : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const data: ChartDataItem[] = await PayTx.aggregate([
      {
        $match: {
          merchantId: new mongoose.Types.ObjectId(config._id),
          createdAt: { $gte: fromDate },
          status: "success",
        },
      },

      {
        $lookup: {
          from: "chains",
          localField: "chainId",
          foreignField: "chainId",
          as: "chain",
        },
      },
      { $unwind: "$chain" },

      {
        $addFields: {
          tokenKey: {
            $cond: [
              {
                $and: ["$isToken", { $ne: ["$tokenAddress", null] }],
              },
              {
                $let: {
                  vars: {
                    token: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$chain.tokens",
                            as: "t",
                            cond: {
                              $eq: [{ $toLower: "$$t.contractAddress" }, { $toLower: "$tokenAddress" }],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    $ifNull: ["$$token.symbol", "UNKNOWN"],
                  },
                },
              },
              "Native",
            ],
          },
        },
      },

      // group per chain + token
      {
        $group: {
          _id: {
            chainId: "$chainId",
            token: "$tokenKey",
          },
          total: { $sum: "$amount" },
        },
      },

      // group per chain
      {
        $group: {
          _id: "$_id.chainId",
          tokens: {
            $push: {
              k: "$_id.token",
              v: "$total",
            },
          },
        },
      },

      // flatten
      {
        $project: {
          _id: 0,
          chainId: "$_id",
          tokensObj: { $arrayToObject: "$tokens" },
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [{ chainId: "$chainId" }, "$tokensObj"],
          },
        },
      },
    ]);

    return res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      message: err?.message || "Server Error",
    });
  }
}
export async function changeMerchantGateway(req: Request, res: Response) {
  const { address, config } = req.body;

  try {
    if (!address || !config) {
      return res.status(400).json({
        success: false,
        message: "address and config are required",
      });
    }

    const wallet = address.toLowerCase();

    // ✅ Only creator can update
    const updated = await PayConfig.findOneAndUpdate(
      {
        creatorAddress: wallet,
      },
      {
        $set: {
          redirectUrl: config?.redirectUrl,
          receiverAddress: config?.address?.toLowerCase(),
        },
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Active config not found or not authorized",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Gateway updated successfully",
    });
  } catch (error) {
    console.error("changeMerchantGateway error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}
export async function getTxHistory(req: Request, res: Response) {
  try {
    const { page = "1", limit = "10" } = req.query as any;
    const address = (req.query.address as string)?.toLowerCase();
    if (!address) {
      return res.status(400).json({ message: "address required" });
    }

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(parseInt(limit), 50);
    const skip = (pageNum - 1) * limitNum;
    // ✅ 1. Find config (creator OR approved director)
    const config = await PayConfig.findOne({
      $or: [
        { creatorAddress: address },
        {
          directors: {
            $elemMatch: {
              address,
              isApproved: true,
            },
          },
        },
      ],
    }).select("_id");
    const data = await PayTx.aggregate([
      {
        $match: {
          merchantId: config?._id,
          status: { $in: ["success", "failed", "pending"] },
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limitNum },

      // 🔗 chain lookup
      {
        $lookup: {
          from: "chains",
          localField: "chainId",
          foreignField: "chainId",
          as: "chain",
        },
      },

      { $unwind: { path: "$chain", preserveNullAndEmptyArrays: true } },

      // 🧠 safe token resolution
      {
        $addFields: {
          tokens: { $ifNull: ["$chain.tokens", []] },

          nativeSymbol: {
            $ifNull: ["$chain.nativeSymbol", "NATIVE"],
          },
        },
      },

      {
        $addFields: {
          tokenSymbol: {
            $cond: [
              "$isToken",
              {
                $let: {
                  vars: {
                    token: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$tokens",
                            as: "t",
                            cond: {
                              $eq: [{ $toLower: "$$t.contractAddress" }, { $toLower: { $ifNull: ["$tokenAddress", ""] } }],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    $ifNull: ["$$token.symbol", "UNKNOWN"],
                  },
                },
              },
              "$nativeSymbol",
            ],
          },
        },
      },

      // 🎯 final shape
      {
        $project: {
          _id: 1,
          txHash: 1,
          chainId: 1,
          amount: 1,
          token: "$tokenSymbol",
          status: 1,
          isRefund: 1,
          createdAt: 1,
        },
      },
    ]);

    return res.status(200).json({
      page: pageNum,
      limit: limitNum,
      hasMore: data.length === limitNum,
      data,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      message: error?.message || "Server Error",
    });
  }
}
/**
 *
 * @param creatorAddress
 * @param newAddress
 * @returns add new wallet address into
 */
export async function addDirector(req: Request, res: Response) {
  try {
    const { creatorAddress, newAddress } = req.body;

    const normalized = newAddress.toLowerCase();

    const payConfig = await PayConfig.findOne({ creatorAddress });
    if (!payConfig) {
      return res.status(404).json({ message: "You are not Director" });
    }

    const isUnique = await isAddressUnique(normalized);
    if (!isUnique) {
      return res.status(400).json({
        message: "Address already used in another config",
      });
    }

    payConfig.directors.push({
      address: normalized,
      isApproved: false,
    });

    await payConfig.save();

    res.json({ message: "Added successFully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to add director" });
  }
}

export async function getDirectors(req: Request, res: Response) {
  try {
    const address = (req.query.address as string)?.toLowerCase();

    if (!address) {
      return res.status(400).json({ message: "Address required" });
    }

    const config = await PayConfig.findOne({
      $or: [
        { creatorAddress: address },
        {
          "directors.address": address,
          "directors.isApproved": true,
        },
      ],
    });

    if (!config) {
      return res.status(404).json({ message: "Could not find" });
    }

    const addresses = [config.creatorAddress, ...config.directors.map((d) => d.address)];

    const profiles = await Profile.find({ address: { $in: addresses } }, { address: 1, displayName: 1, avatarUrl: 1 }).lean();

    const mapProfile = Object.fromEntries(profiles.map((p) => [p.address, p]));

    // 👇 Build result properly
    const result = [
      // Owner (manually constructed)
      {
        _id: config._id, // config id (useful for ownership actions)
        address: config.creatorAddress,
        displayName: mapProfile[config.creatorAddress]?.displayName || "Unnamed",
        avatarUrl: mapProfile[config.creatorAddress]?.avatarUrl || null,
        role: "owner",
        status: true,
        addedAt: config.createdAt,
      },

      // Directors (real subdocs with _id)
      ...config.directors.map((d) => ({
        _id: d._id, // ✅ IMPORTANT
        address: d.address,
        displayName: mapProfile[d.address]?.displayName || "Unnamed",
        avatarUrl: mapProfile[d.address]?.avatarUrl || null,
        role: "director",
        status: d.isApproved,
        addedAt: d.addedAt,
      })),
    ];

    return res.json({ success: true, id: config._id, data: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function toggleDirector(req: Request, res: Response) {
  try {
    const { id, address } = req.body;

    if (!id || !address) {
      return res.status(400).json({
        message: "Director id and address required",
      });
    }

    const directorId = new Types.ObjectId(id);

    const config = await PayConfig.findOne({
      "directors._id": directorId,
    });

    if (!config) {
      return res.status(404).json({ message: "Director not found" });
    }

    // 🔐 ONLY OWNER CAN TOGGLE
    if (config.creatorAddress !== address.toLowerCase()) {
      return res.status(403).json({
        message: "Only owner can change director status",
      });
    }

    await PayConfig.updateOne({ "directors._id": directorId }, [
      {
        $set: {
          directors: {
            $map: {
              input: "$directors",
              as: "d",
              in: {
                $cond: [
                  { $eq: ["$$d._id", directorId] },
                  {
                    $mergeObjects: [
                      "$$d",
                      {
                        isApproved: { $not: "$$d.isApproved" },
                      },
                    ],
                  },
                  "$$d",
                ],
              },
            },
          },
        },
      },
    ]);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Failed to toggle director",
    });
  }
}

export async function changeOwnerShip(req: Request, res: Response) {
  const session = await mongoose.startSession();

  try {
    const { id, address } = req.body;

    if (!id || !address) {
      return res.status(400).json({
        message: "Director id and caller address required",
      });
    }

    const caller = address.toLowerCase();
    const directorId = new Types.ObjectId(id);

    session.startTransaction();

    // 1️⃣ Find config
    const config = await PayConfig.findOne({ "directors._id": directorId }, null, { session });

    if (!config) {
      throw new Error("Director not found");
    }

    // 2️⃣ Only owner can transfer
    if (config.creatorAddress !== caller) {
      throw new Error("Only owner can transfer ownership");
    }

    // 3️⃣ Target director
    const targetDirector = config.directors.id(directorId);

    if (!targetDirector || !targetDirector.isApproved) {
      throw new Error("Director must be approved");
    }

    const oldOwner = caller;
    const newOwner = targetDirector.address;

    // 4️⃣ KYC check
    const kyc = await Kyc.findOne({ address: newOwner }).session(session);

    if (!kyc || kyc.status !== "approved") {
      throw new Error("Target user KYC not approved");
    }
    // ======================================================
    // 🔥 Upgrade kyc Profile
    // ======================================================
    const [oldOwnerProfile, newOwnerProfile] = await Promise.all([Profile.findOne({ address: oldOwner }).select("_id"), Profile.findOne({ address: newOwner }).select("_id")]);
    await BusinessKyc.findOneAndUpdate({ userId: oldOwnerProfile?._id }, { $set: { userId: newOwnerProfile?._id } }).session(session);

    // ======================================================
    // 🔥 SUBSCRIPTION TRANSFER
    // ======================================================

    const oldSub = await SubscriptionModel.findOne({ address: oldOwner }).session(session);

    let newSub = await SubscriptionModel.findOne({ address: newOwner }).session(session);

    if (!newSub) {
      newSub = await SubscriptionModel.create([{ address: newOwner, packages: {} }], { session }).then((res) => res[0]);
    }

    if (oldSub?.packages?.business?.expireAt) {
      const businessPkg = oldSub.packages.business;

      // transfer
      if (newSub?.packages) {
        newSub.packages.business = {
          pkgId: businessPkg.pkgId,
          expireAt: businessPkg.expireAt,
        };
      }

      // 🔥 IMPORTANT: delete, not undefined
      await SubscriptionModel.updateOne({ _id: oldSub._id }, { $unset: { "packages.business": "" } }, { session });

      await oldSub.save({ session });
      await newSub?.save({ session });
    }

    // ======================================================
    // 🔥 OWNERSHIP TRANSFER
    // ======================================================

    config.creatorAddress = newOwner;

    // ======================================================
    // 🔥 DIRECTOR CLEANUP (SAFE)
    // ======================================================

    const filteredDirectors = config.directors.filter((d) => d.address !== oldOwner && d.address !== newOwner);

    config.directors = filteredDirectors as any;

    config.markModified("directors");

    // optional: add old owner as director
    config.directors.push({
      address: oldOwner,
      isApproved: true,
      addedAt: new Date(),
    });

    await config.save({ session });

    // ======================================================
    // ✅ COMMIT
    // ======================================================

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: "Ownership transferred successfully",
      data: {
        oldOwner,
        newOwner,
      },
    });
  } catch (error: any) {
    // ❌ ROLLBACK EVERYTHING
    await session.abortTransaction();
    session.endSession();

    console.error(error);

    return res.status(400).json({
      message: error.message || "Failed to transfer ownership",
    });
  }
}

export async function removeDirector(req: Request, res: Response) {
  const session = await mongoose.startSession();

  try {
    const { id, address } = req.body;

    if (!id || !address) {
      return res.status(400).json({
        message: "id and address required",
      });
    }

    const caller = address.toLowerCase();

    session.startTransaction();

    const config = await PayConfig.findOne({ "directors._id": new Types.ObjectId(id) }, null, { session });

    if (!config) {
      throw new Error("Director not found");
    }

    const director = config.directors.id(id);

    if (!director) {
      throw new Error("Invalid director");
    }

    const isOwner = config.creatorAddress === caller;
    const isSelf = director.address === caller;

    // ❌ Neither owner nor self
    if (!isOwner && !isSelf) {
      throw new Error("Not authorized to remove this director");
    }

    // ❗ Prevent owner removing themselves
    if (isOwner && isSelf) {
      throw new Error("Owner cannot remove themselves");
    }

    // ✅ Remove director
    director.deleteOne();
    config.markModified("directors");

    await config.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: isSelf ? "You have left as director" : "Director removed successfully",
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({
      message: error.message || "Failed to remove director",
    });
  }
}
export async function deleteMerchant(req: Request, res: Response) {
  const session = await mongoose.startSession();

  try {
    const { id, address } = req.body;

    if (!id || !address) {
      return res.status(400).json({
        message: "id and currentUser required",
      });
    }

    const caller = address.toLowerCase();

    session.startTransaction();

    // 1️⃣ Get merchant config
    const config = await PayConfig.findById(id).session(session);

    if (!config) {
      throw new Error("Merchant not found");
    }

    // 2️⃣ Check ownership
    if (config.creatorAddress !== caller) {
      throw new Error("Only owner can delete merchant");
    }

    // 3️⃣ Directors must be only 1
    if (config.directors.length > 1) {
      throw new Error("Remove all directors before deleting merchant");
    }

    // 4️⃣ Get profile
    const profile = await Profile.findOne({ address: caller }).select("_id").session(session);

    // 5️⃣ Delete BusinessKyc
    if (profile?._id) {
      await BusinessKyc.deleteOne({ userId: profile._id }).session(session);
    }

    // 6️⃣ Remove business package only
    await SubscriptionModel.updateOne({ address: caller }, { $unset: { "packages.business": "" } }, { session });

    // 7️⃣ Delete merchant config
    await PayConfig.deleteOne({ _id: id }).session(session);

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: "Merchant deleted successfully",
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({
      message: error.message || "Failed to delete merchant",
    });
  }
}

// ! --- api
export async function getMerchantApiKeys(req: Request, res: Response) {
  const address = (req.query.address as string)?.toLowerCase();
  if (!address) return res.status(404).json({ message: "Address Required" });
  try {
    const config = await PayConfig.findOne({ $or: [{ creatorAddress: address }, { "directors.address": address, "directors.isApproved": true }] });

    if (!config) {
      return res.json({ config: null });
    }

    return res.json({
      data: config.keys ?? [],
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}
export async function createApiKey(req: Request, res: Response) {
  try {
    const { label, address } = req.body;

    if (!label || !address) {
      return res.status(400).json({
        message: "Missing label or address",
      });
    }

    const creatorAddress = address.toLowerCase();

    const config = await PayConfig.findOne({ creatorAddress });

    if (!config) {
      return res.status(403).json({
        message: "Only owner can create API keys",
      });
    }

    // 🔑 Generate keys
    const publicKey = generateKey("pk_live");
    const secretKey = generateKey("sk_live");

    // 🔐 Hash secret
    const apiKeyHash = hashValue(secretKey);

    // 💾 Push new key
    config.keys.push({
      label,
      publicKey,
      apiKeyHash,
      apiKeyLast4: secretKey.slice(-4),
      isActive: true,
      createdAt: new Date(),
    });

    await config.save();

    return res.status(201).json({
      message: "API key created successfully",
      key: {
        publicKey,
        secretKey,
      },
    });
  } catch (error) {
    console.error("createApiKey error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
}

export async function deleteApiKey(req: Request, res: Response) {
  try {
    const { keyId } = req.params;
    const { address } = req.body;

    if (!keyId || !address) {
      return res.status(400).json({ message: "Missing data" });
    }

    const creatorAddress = address.toLowerCase();

    const updated = await PayConfig.findOneAndUpdate(
      { creatorAddress },
      {
        $pull: {
          keys: { _id: keyId },
        },
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "Only Owner can take this Action" });
    }

    return res.json({
      success: true,
      message: "API key deleted",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
}

// ! ---Recurrenting

export async function createRecurringApi(req: Request, res: Response) {
  try {
    const { address, amount, wallet, email, isMonthly } = req.body;

    // ✅ Basic validation
    if (!address || !wallet || !amount || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const lowerAddress = address.toLowerCase();
    const lowerUserAddress = wallet.toLowerCase();

    // ✅ Merchant validation
    const config = await PayConfig.findOne({
      $or: [
        { creatorAddress: lowerAddress },
        {
          "directors.address": lowerAddress,
          "directors.isApproved": true,
        },
      ],
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Merchant config not found",
      });
    }
    const profile = await Profile.findOne({ address: config?.creatorAddress });
    const merchantConfig = await BusinessKyc.findOne({ userId: profile?._id });
    // ✅ Create subscription
    const url = await createRecurring({
      merchantId: config._id.toString(),
      amount: Number(amount),
      address: lowerUserAddress,
      email,
      isMonthly,
      companyName: merchantConfig?.companyName ?? "Unknown",
    });

    return res.status(200).json({
      success: true,
      checkoutUrl: url,
    });
  } catch (error: any) {
    console.error("createRecurringApi error:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error",
    });
  }
}
export async function getSubscriptionHistory(req: Request, res: Response) {
  try {
    const {
      address,
      page = 1,
      limit = 10,
    } = req.query as {
      address: string;
      page?: string;
      limit?: string;
    };

    if (!address) {
      return res.status(400).json({ message: "Address is required" });
    }

    const lowerAddress = address.toLowerCase();

    // 🔥 1. find merchant
    const config = await PayConfig.findOne({
      $or: [
        { creatorAddress: lowerAddress },
        {
          "directors.address": lowerAddress,
          "directors.isApproved": true,
        },
      ],
    });

    if (!config) {
      return res.status(404).json({ message: "Merchant not found" });
    }

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // 🔥 2. aggregation
    const pipeline: any[] = [
      {
        $match: {
          merchantId: config._id,
        },
      },

      { $sort: { createdAt: -1 } },

      { $skip: skip },
      { $limit: limitNum },

      // 🔥 join PayTx
      {
        $lookup: {
          from: "paytxes",
          let: { ids: "$sessionIds" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$ids"] },
              },
            },
            {
              $project: {
                sessionId: 1,
                status: 1,
              },
            },
          ],
          as: "sessions",
        },
      },

      // 🔥 final shape
      {
        $project: {
          _id: 1,
          address: 1,
          email: 1,
          amount: 1,
          isMonthly: 1,
          nextBillingDate: 1,
          status: 1,
          createdAt: 1,
          sessions: 1,
        },
      },
    ];

    const results = await PaySubscriptionTxModel.aggregate(pipeline);

    // 🔥 check if more pages exist
    const total = await PaySubscriptionTxModel.countDocuments({
      merchantId: config._id,
    });

    const hasMore = skip + results.length < total;

    return res.json({
      data: results,
      page: pageNum,
      limit: limitNum,
      hasMore,
    });
  } catch (error) {
    console.error("Subscription history error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
export async function toggleSubscriptionStatus(req: Request, res: Response) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Missing required id" });
    }

    const sub = await PaySubscriptionTxModel.findById(id);

    if (!sub) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // 🔥 status cycle
    let nextStatus: SubscriptionStatus;

    switch (sub.status) {
      case SubscriptionStatus.EXPIRED:
        nextStatus = SubscriptionStatus.CANCELLED;
        break;

      case SubscriptionStatus.CANCELLED:
        nextStatus = SubscriptionStatus.ACTIVE;
        break;

      case SubscriptionStatus.ACTIVE:
        nextStatus = SubscriptionStatus.EXPIRED;
        break;

      default:
        nextStatus = SubscriptionStatus.ACTIVE;
        break;
    }

    sub.status = nextStatus;
    await sub.save();

    return res.json({
      message: "Status updated successfully",
      status: sub.status,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}