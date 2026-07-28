import { ethers } from "ethers";
import { Request, Response } from "express";
import { PERIOD_SECONDS } from "../../config/Package";
import { convertToNative, getTokenPrices } from "../../utils/price";
import { generatePackageSignature } from "../../utils/signature";
import { DozAdminModel } from "../schemas/sch.DozRewordPool";
import { PayConfig } from "../schemas/sch.payConfig";
import { Pricing, PricingMode } from "../schemas/sch.pricing";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
import { Profile } from "../schemas/sch.userProfile";

type PkgType = 0 | 1 | 2 | 3;

export async function getUserSubscription(req: Request, res: Response) {
  try {
    const { address: rawAddress } = req.query as { address: string };

    if (!rawAddress) {
      return res.status(400).json({ message: "Address is required" });
    }

    const address = rawAddress.toLowerCase();

    const subscription = await SubscriptionModel.findOne({ address });

    if (!subscription) {
      return res.status(200).json({
        nft: null,
        business: null,
      });
    }

    return res.status(200).json({
      nft: subscription.packages?.nft ?? null,
      business: subscription.packages?.business ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error,
    });
  }
}

export async function getNextPlanDetails(req: Request, res: Response) {
  try {
    const { address, newPkgId, chainId, useToken, mode } = req.body as { address: string; newPkgId: PkgType; chainId: number; useToken: boolean; mode: PricingMode };

    if (!address || newPkgId == null || chainId == null || !mode) {
      return res.status(400).json({
        error: "address, newPkgId, chainId and mode required",
      });
    }
    if (!["nft", "business"].includes(mode)) {
      return res.status(400).json({ error: "invalid mode" });
    }

    const lowerAddress = address.toLowerCase();
    const pkg = await Pricing.findOne({ pkgId: newPkgId, mode });
    if (!pkg) return res.status(400).json({ error: "invalid package" });

    // 🔥 get subscription instead of FeeSignature
    const subscription = await SubscriptionModel.findOne({
      address: lowerAddress,
    });
    const now = Math.floor(Date.now() / 1000);
    const expireTimestamp = now + PERIOD_SECONDS;

    let priceUSD = pkg.amount;
    let discountUSD = 0;
    const existingPkg = subscription?.packages?.[mode];

    if (existingPkg && existingPkg.pkgId < newPkgId) {
      const existingExpire = existingPkg.expireAt ? Math.floor(new Date(existingPkg.expireAt).getTime() / 1000) : 0;

      if (existingExpire > now) {
        const remaining = existingExpire - now;
        const currentPkg = await Pricing.findOne({ pkgId: existingPkg.pkgId, mode });
        

        discountUSD = (currentPkg?.amount! * remaining) / PERIOD_SECONDS;

        priceUSD = Math.max(priceUSD - discountUSD, 0);
      }
    }

    let convertionRate = 0;

    if (useToken) {
      const dozValue = await DozAdminModel.findById("admin", {
        dozValueInUsd: 1,
      });
      convertionRate = dozValue?.dozValueInUsd || 0;
    } else {
      const tokenPriceUsd = await getTokenPrices(chainId);
      if (!tokenPriceUsd || tokenPriceUsd <= 0) {
        return res.status(400).json({ error: "token price not available" });
      }
      convertionRate = tokenPriceUsd;
    }

    const amountNativeStr = convertToNative(priceUSD, convertionRate);

    const amountWei = ethers.parseUnits(amountNativeStr, 18).toString();

    return res.status(201).json({
      address: lowerAddress,
      mode,
      newPkgId,
      chainId,
      priceUSD,
      discountUSD,
      amountNativeStr,
      amountWei,
      expireTimestamp,
      feeBps: pkg.fee,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
}

export async function paymentCheckoutDetails(req: Request, res: Response) {
  try {
    const { address, amountWei, newPkgId, chainId, mode } = req.body;

    const now = Math.floor(Date.now() / 1000);
    const expireTimestamp = now + 5 * 60;

    const signature = await generatePackageSignature({
      address,
      pkgId: newPkgId,
      amountWei,
      expireTimestamp,
      chainId,
      callType: mode,
    });

    return res.status(201).json({
      signature,
      expireTimestamp,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
}

export async function updateSubscription({ address, pkgId, mode }: { address: string; pkgId: PkgType; mode: "nft" | "business" }) {
  const now = new Date();
  const newExpire = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const profile = await Profile.findOne({ address }).select("_id");

  if (mode === "business" && profile?._id) {
    await PayConfig.findOneAndUpdate({ creatorAddress: address }, { $set: { pkgId,txCount:0 } }, { upsert: true });
  }

  return SubscriptionModel.findOneAndUpdate(
    { address },
    {
      $set: {
        [`packages.${mode}`]: {
          pkgId,
          expireAt: newExpire,
        },
      },
    },
    { upsert: true, new: true },
  );
}
