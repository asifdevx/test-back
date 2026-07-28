import { Request, Response } from "express";
import { PayConfig } from "../schemas/sch.payConfig";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
import { Profile } from "../schemas/sch.userProfile";
export const getAllConfigsForAdmin = async (req: Request, res: Response) => {
  try {
    const { search = "" } = req.query as { search?: string };

    const pipeline: any[] = [
      // 🔗 Join Profile via creatorAddress
      {
        $lookup: {
          from: "profiles",
          localField: "creatorAddress",
          foreignField: "address",
          as: "profile",
        },
      },
      {
        $unwind: {
          path: "$profile",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔗 Join BusinessKyc via profile._id → userId
      {
        $lookup: {
          from: "businesskycs",
          localField: "profile._id",
          foreignField: "userId",
          as: "business",
        },
      },
      {
        $unwind: {
          path: "$business",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔍 Search by companyName OR wallet address
      ...(search
        ? [
            {
              $match: {
                $or: [
                  {
                    "business.companyName": {
                      $regex: search,
                      $options: "i",
                    },
                  },
                  {
                    creatorAddress: {
                      $regex: search,
                      $options: "i",
                    },
                  },
                  {
                    receiverAddress: {
                      $regex: search,
                      $options: "i",
                    },
                  },
                ],
              },
            },
          ]
        : []),

      // 📦 Projection
      {
        $project: {
          creatorAddress: 1,
          receiverAddress: 1,
          publicKey: 1,
          redirectUrl: 1,
          txCount: 1,
          pkgId: 1,
          createdAt: 1,

          companyName: "$business.companyName",
        },
      },

      { $sort: { createdAt: -1 } },
    ];

    const data = await PayConfig.aggregate(pipeline);
  
    
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch configs" });
  }
};

export const deletePayConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await PayConfig.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Config not found" });
    }

    return res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({ message: "Delete failed" });
  }
};

export const updatePayConfigByAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { pkgId, isActive, txCount, webhookUrl, successUrl, failedUrl } = req.body;

    const payConfig = await PayConfig.findById(id);

    if (!payConfig) {
      return res.status(404).json({ message: "Config not found" });
    }

    const update: any = {};

    let address: string | null = null;
    if (pkgId !== undefined) {
      const profile = await Profile.findOne({ address: payConfig.creatorAddress }).lean();

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      address = profile.address?.toLowerCase();

      if (!address) {
        return res.status(400).json({ message: "Profile has no address" });
      }

      update.pkgId = pkgId;

      // ✅ update subscription
      await SubscriptionModel.updateOne(
        { address },
        {
          $set: {
            "packages.business.pkgId": pkgId,
            "packages.business.expireAt": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        { upsert: true },
      );
    }
    // 2️⃣ update PayConfig fields

    if (isActive !== undefined) update.isActive = isActive;
    if (txCount !== undefined) update.txCount = txCount;
    if (webhookUrl !== undefined) update.webhookUrl = webhookUrl;
    if (successUrl !== undefined) update.successUrl = successUrl;
    if (failedUrl !== undefined) update.failedUrl = failedUrl;

    const updated = await PayConfig.findByIdAndUpdate(id, update, {
      new: true,
    });

    return res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to update config" });
  }
};
