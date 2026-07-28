import { Request, Response } from "express";
import { Pricing } from "../schemas/sch.pricing";

export const getPricingList = async (req: Request, res: Response) => {
  const { mode } = req.query;
  try {
    const filter: any = {};
    if (mode && mode !== "all") {
      filter.mode = mode;
    }
    const data = await Pricing.find(filter).sort({ mode: 1, pkgId: 1 });

    res.json({
      success: true,
      data: data ? data : [],
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch pricing",
    });
  }
};

export const createPricingList = async (req: Request, res: Response) => {
  const { mode, title, fee, amount } = req.body;


  if (!mode || !title || !fee || amount == null) return res.status(404).json({ message: "require Items" });

  try {
    const count = await Pricing.countDocuments({ mode });
    

    if (count > 4) {
      return res.status(400).json({
        success: false,
        message: "No more slots available (max 4 per mode)",
      });
    }

    const last = await Pricing.findOne({ mode }).sort({ pkgId: -1 }).select("pkgId");

    const nextPkgId = last ? last.pkgId + 1 : 0;

    // ✅ create
    const created = await Pricing.create({
      mode,
      title,
      fee,
      amount,
      pkgId: nextPkgId,
    });

    return res.json({
      success: true,
      data: created,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch pricing",
    });
  }
};

export const updatePricing = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, fee, amount } = req.body;

    // ✅ validation
    if (!title || fee === undefined || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "title, fee and amount are required",
      });
    }

    // ✅ update only allowed fields
    const updated = await Pricing.findByIdAndUpdate(
      id,
      {
        $set: {
          title,
          fee,
          amount,
        },
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Pricing not found",
      });
    }

    return res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    console.error("updatePricing error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to update pricing",
    });
  }
};
