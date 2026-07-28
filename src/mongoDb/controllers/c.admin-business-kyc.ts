import { Request, Response } from "express";
import { businessKycReviewTemplet } from "../../utils/emailTemplet";
import { BusinessKyc, BusinessStatus } from "../schemas/sch.businessKyc";
import { PayConfig } from "../schemas/sch.payConfig";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
/**
 * GET admin/pay/getBusinessKycs
 * @param req
 * @param res
 */
export const getBusinessKycs = async (req: Request, res: Response) => {
  try {
    const { search = "", status, page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const pipeline: any[] = [
      {
        $lookup: {
          from: "profiles",
          localField: "userId",
          foreignField: "_id",
          as: "profile",
        },
      },
      { $unwind: "$profile" },
    ];

    // 🔍 filters
    const match: any = {};

    // status filter
    if (status && status !== "all") {
      match.status = status;
    }

    // search filter
    if (search) {
      match.$or = [
        { "profile.email": { $regex: search, $options: "i" } },
        { "profile.address": { $regex: search, $options: "i" } },
        { "profile.displayName": { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
      ];
    }

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
      {
        $project: {
          _id: 1,
          userId: 1,
          companyName: 1,
          dba: 1,
          country: 1,
          regAddress: 1,
          bizAddress: 1,
          regNumber: 1,
          vatNumber: 1,
          regions: 1,
          description: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          managerName: 1,
          birthDate: 1,
          regCertificate: 1,
          directors: 1,
          storeName: 1,
          socialMedia: 1,
          businessTypes: 1,
          proofOfSettlement: 1,
          profile: {
            address: 1,
            displayName: 1,
            email: 1,
          },
        },
      },
    );

    const data = await BusinessKyc.aggregate(pipeline);

    // total count (for frontend pagination)
    const totalPipeline = [
      {
        $lookup: {
          from: "profiles",
          localField: "userId",
          foreignField: "_id",
          as: "profile",
        },
      },
      { $unwind: "$profile" },
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      { $count: "total" },
    ];

    const totalResult = await BusinessKyc.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;

    res.json({
      data,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", err });
  }
};

export const reviewKyc = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    if (!Object.values(BusinessStatus).includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const kyc = await BusinessKyc.findById(id).populate("userId", "displayName email address");

    if (!kyc) {
      return res.status(404).json({ message: "KYC not found" });
    }

    kyc.status = status;
    await kyc.save();
    const user = kyc.userId as any;
    const address = user?.address?.toLowerCase();

    if (address && status === BusinessStatus.APPROVED) {
      await SubscriptionModel.updateOne(
        { address },
        {
          $setOnInsert: { address }, // create if not exists
          $set: {
            "packages.business": {
              pkgId: 0, // 👈 free business plan
              expireAt: null, // optional
            },
          },
        },
        { upsert: true },
      );   
      
      const existingConfig = await PayConfig.findOne({
        creatorAddress: address,
      });

      if (!existingConfig) {
        await PayConfig.create({
          creatorAddress: address,
          receiverAddress: address, // default = same wallet
          redirectUrl: null,
          keys: [],
          directors: [],
          pkgId: 0,
          txCount: 0,
        });
      }
      
    }
    if (user?.email) {
      await businessKycReviewTemplet({ companyName: kyc?.companyName, status, user });
    }
    return res.json({
      message: `KYC ${status} successfully`,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
