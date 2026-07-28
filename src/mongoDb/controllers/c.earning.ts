import { Request, Response } from "express";
import { Earnings } from "../schemas/sch.earning";
import { FeeEventModel, PlatFormType } from "../schemas/sch.plaformFee";
export const handleIncrementEarning = async (req: Request, res: Response) => {
  try {
    const { chainId, amount, date, type, isDoz = false } = req.body;
    if (!chainId || !date || amount == null || !type) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["platformFee", "subscriptionFee"].includes(type)) {
      return res.status(400).json({ message: "Invalid earning type" });
    }
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);
    await Earnings.findOneAndUpdate(
      { chainId, date: normalizedDate, isDoz },
      {
        $inc: {
          [`earnings.${type}`]: amount,
          totalForChain: amount,
        },
        isDoz,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
    res.status(201).json({
      message: "Earning added successfully",
    });
  } catch (error) {
    console.error("Add earning error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getDailyMarketplaceEarnings = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;

    const match: any = {};
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from as string);
      if (to) match.date.$lte = new Date(to as string);
    }

    const docs = await Earnings.find(match).sort({ date: 1 }).lean();

    const dailyMap: Record<string, any> = {};
    for (const d of docs) {
      const day = d.date.toISOString().slice(0, 10);

      if (!dailyMap[day]) {
        dailyMap[day] = {
          date: day,
          grandTotal: 0,
          totalPlatformFee: 0,
          totalSubscriptionFee: 0,
          chains: {},
        };
      }

      const key = `${d.chainId}-${d.isDoz ? "DOZ" : "NATIVE"}`;

      if (!dailyMap[day].chains[key]) {
        dailyMap[day].chains[key] = {
          chainId: d.chainId,
          isDoz: d.isDoz,
          platformFee: 0,
          subscriptionFee: 0,
          total: 0,
        };
      }

      const chain = dailyMap[day].chains[key];
      if (d.earnings) {
        chain.platformFee += d.earnings.platformFee;
        chain.subscriptionFee += d.earnings.subscriptionFee;
        chain.total += d.totalForChain;

        dailyMap[day].totalPlatformFee += d.earnings.platformFee;
        dailyMap[day].totalSubscriptionFee += d.earnings.subscriptionFee;
      }
      dailyMap[day].grandTotal += d.totalForChain;
    }
    res.json(Object.values(dailyMap));
  } catch (err) {
    console.error("Daily analytics error:", err);
    res.status(500).json({ message: "Failed to load daily earnings" });
  }
};

export const handlePlaformFeeEvents = async (req: Request, res: Response) => {
  const { address, eventType, chainId, amount, txHash, isDoz } = req.body;

  try {
    // ✅ Basic validation
    if (!address || !eventType || !chainId || !amount) {
      return res.status(400).json({
        success: false,
        message: "address, eventType, chainId and amount are required",
      });
    }

    // ✅ Validate eventType
    if (!Object.values(PlatFormType).includes(eventType)) {
      return res.status(422).json({
        success: false,
        message: "Invalid eventType",
      });
    }

    // ✅ Create event
    const event = await FeeEventModel.create({
      address: address.toLowerCase(),
      type: eventType,
      chainId,
      amount,
      txHash,
      isDoz,
    });

    return res.status(201).json({
      success: true,
      message: "Platform fee event recorded",
      data: event,
    });
  } catch (error: any) {
    console.error("Platform fee error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
