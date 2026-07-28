// controllers/reward.controller.ts
import { Request, Response } from "express";
import { getFxRates } from "../../utils/price";
import { DozAdminModel } from "../schemas/sch.DozRewordPool";
import { IRewardCondition, RewardConditionModel } from "../schemas/sch.RewardCondition";

export const getAllRewards = async (req: Request, res: Response) => {
  try {
    // Fetch all conditions for enabled chains
    const conditions = await RewardConditionModel.find().sort({ chainId: 1, packageId: 1 });
    res.json({ success: true, data: conditions });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateChainRewards = async (req: Request, res: Response) => {
  const { chainId, updates } = req.body;

  try {
    const operations = updates.map((upd: IRewardCondition) => ({
      updateOne: {
        filter: {
          chainId,
          packageId: upd.packageId,
          period: upd.period,
        },
        update: {
          percentage: upd.percentage,
        },
        upsert: true,
      },
    }));

    await RewardConditionModel.bulkWrite(operations);

    res.json({
      success: true,
      message: "Rewards updated successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Bulk update failed",
    });
  }
};

export const getDozContractConfig = async (req: Request, res: Response) => {
  try {
    let admin = await DozAdminModel.findById("admin");
    if (!admin) {
      admin = await DozAdminModel.create({
        _id: "admin",
      });
    }
    return res.json(admin);
  } catch (error) {
    return res.status(500).json({ error: "Internal" });
  }
};

/**
 * Update Min Withdraw
 */
export const updateMinDozWithdaw = async (req: Request, res: Response) => {
  try {
    const { minWithdraw } = req.body;

    const pool = await DozAdminModel.findByIdAndUpdate("admin", { minWithdraw }, { new: true, upsert: true });

    res.json(pool);
  } catch (err) {
    res.status(500).json({ message: "Failed to update minWithdraw", error: err });
  }
};

export const updateDozValue = async (req: Request, res: Response) => {
  try {
    const { dozValueInUsd } = req.body;

    if (!dozValueInUsd || isNaN(dozValueInUsd)) {
      return res.status(400).json({ message: "Invalid USD price" });
    }

    // optional: get FX rates using your existing system
    // assuming getPriceBySymbol("USD") returns FX info OR you replace this with FX service
    const usdPrice = Number(dozValueInUsd);

    // fallback FX rates (replace with real service if you already have one)
      const { EUR, GBP } = await getFxRates();

    const dozValueInEur = usdPrice * EUR;
    const dozValueInGbp = usdPrice * GBP;

    const pool = await DozAdminModel.findByIdAndUpdate(
      "admin",
      {
        dozValueInUsd: usdPrice,
        dozValueInEur,
        dozValueInGbp,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    return res.json({
      success: true,
      data: pool,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to update price",
      error: err instanceof Error ? err.message : err,
    });
  }
};