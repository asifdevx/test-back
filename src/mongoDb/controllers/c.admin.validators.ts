import { Request, Response } from "express";
import { avaxValidator } from "../../Cron/stakeCoins/jobs/validator/avax.validator";
import { bscValidator } from "../../Cron/stakeCoins/jobs/validator/bsc.validator";
import { monadValidator } from "../../Cron/stakeCoins/jobs/validator/mon.validator";
import { polValidators } from "../../Cron/stakeCoins/jobs/validator/pol.validator";
import { seiValidator } from "../../Cron/stakeCoins/jobs/validator/sei.validator";
import { SEI_MAINNET, SEI_REST_URL } from "../../config/stakingCofig";
import { Validator } from "../schemas/sch.Validator";


export const getValidators = async (req: Request, res: Response) => {
  try {
    const { chainId, page = 1, limit = 20 } = req.query;

    const filter: any = {};
    if (chainId && chainId != "undefined") filter.chainId = Number(chainId);

    const [validators, total] = await Promise.all([
      Validator.find(filter)
        .sort({ apr: -1, commissionRate: 1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .lean(),
      Validator.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: validators,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / +limit),
      },
    });
  } catch (err) {
    console.error("Fetch Validators Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const handleValidator = async (req: Request, res: Response) => {
  try {
    const { _id, status, minDelegation } = req.body;

    if (!_id) {
      return res.status(400).json({ success: false, message: "Validator ID required" });
    }

    if (!["active", "inactive", "jailed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    if (minDelegation === undefined || Number(minDelegation) < 0) {
      return res.status(400).json({ success: false, message: "Invalid minDelegation" });
    }

    const validator = await Validator.findByIdAndUpdate(
      _id,
      {
        $set: {
          minDelegation: String(minDelegation), // store human readable
          status,
          lastChecked: new Date(),
        },
      },
      { new: true },
    );

    if (!validator) {
      return res.status(404).json({ success: false, message: "Validator not found" });
    }

    res.json({
      success: true,
      message: "Validator updated successfully",
      data: validator,
    });
  } catch (error) {
    console.error("Update Validator Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const handleSyncValidator=async (req: Request, res: Response) => {
  const {chainId} = req.body;
  try {
    switch (chainId) {
      case 56:
        await bscValidator();
        break;
      case 137:
        await polValidators();
        break;
      case 43114:
        await avaxValidator();
        break;
      case 143:
        await monadValidator();
        break;
      case 1329:
        await seiValidator({ chainId: SEI_MAINNET, URL: SEI_REST_URL });
        break;
        default:  return res.status(400).json({
          success: false,
          message: "Unsupported chainId",
        });
    } return res.json({
      success: true,
      message: "Validator sync completed",
    });
 } catch (error) {
  console.error("Validator sync failed:", error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
 }
}