import express from "express";
import { genaretFillOrderSigniture, generateFeeSignature } from "../../utils/signature";

import { Pricing } from "../schemas/sch.pricing";
import { SubscriptionModel } from "../schemas/sch.user-subscription";

export const genaretOrderSigniture = async (req: express.Request, res: express.Response) => {
  const { orders } = req.body;
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({ error: "No orders provided" });
  }
  try {
    const orderSignatures: string[] = [];
    const feeDatas: { packageId: number; feeBps: number; signature: string }[] = [];

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const sellerAddress = order.maker.toLowerCase();

      const orderSignature = await genaretFillOrderSigniture(order);
      orderSignatures.push(orderSignature);

      const userPkg = await SubscriptionModel.findOne({ address: sellerAddress }).select("packages");
      const pkgId = userPkg?.packages?.nft?.pkgId ?? 0;
      const pricingDetails = await Pricing.findOne({ mode: "nft", pkgId });
      const feeBps = pricingDetails?.fee ?? 250;

      if (!pricingDetails) {
        feeDatas.push({ packageId: 0, feeBps: 0, signature: "0x" });
        continue;
      }
      const signature = await generateFeeSignature({
        address: sellerAddress,
        packageId: pkgId,
        feeBps: pricingDetails.fee,
      });
      feeDatas.push({
        packageId: pkgId,
        feeBps,
        signature,
      });
    }
    return res.status(201).json({ orderSignatures, feeDatas });
  } catch (err) {
    return res.status(201).json({ error: ":- internal" });
  }
};
