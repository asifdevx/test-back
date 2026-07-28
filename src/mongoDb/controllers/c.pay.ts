import { ethers, parseUnits, ZeroAddress } from "ethers";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { BASE_URL } from "../../config/base";
import { createRecurring } from "../../utils/createRecurringPayment";
import { toWei } from "../../utils/decimalToWei";
import { getPriceBySymbol } from "../../utils/price";
import { genaretPayRefundSignature, genaretPaySignature } from "../../utils/signature";
import { Kyc } from "../schemas/kyc.schema";
import { BusinessKyc, BusinessStatus } from "../schemas/sch.businessKyc";
import { DozAdminModel } from "../schemas/sch.DozRewordPool";
import { PayConfig } from "../schemas/sch.payConfig";
import { Chain } from "../schemas/sch.paymentChain";
import { PaymentStatus, PayTx } from "../schemas/sch.payTx";
import { Pricing } from "../schemas/sch.pricing";
import { Profile } from "../schemas/sch.userProfile";

type TxWithMerchant = {
  merchantId: {
    creatorAddress: string;
  };
};
/**
 * POST /merchant/add-merchant-user-kyc
 *
 */
export async function submitMerchantKyc(req: Request, res: Response) {
  try {
    const userId = req.query.userId;

    if (!userId) return res.json({ success: false, message: "No Profile Found" });
    const profileDetails = await Profile.findById(userId);
    const kycDetails = await Kyc.findOne({ address: profileDetails?.address });
    if (kycDetails?.status !== "approved") {
      return res.status(400).json({ message: "Kyc Mendatory" });
    }
    let kyc = await BusinessKyc.findOne({ userId });
    if (!kyc) {
      // 👉 Create new
      kyc = await BusinessKyc.create({
        userId,
        ...req.body,
      });
    } else {
      // 👉 Update only if rejected
      if (kyc.status !== "rejected") {
        return res.json({
          success: false,
          message: "KYC already submitted and not rejected",
        });
      }

      Object.assign(kyc, req.body);
      kyc.status = BusinessStatus.PENDING;

      await kyc.save();
    }

    return res.json({ succcss: true, message: "Submitted successfully." });
  } catch (error) {
    res.status(500).json({ message: "KYC failed" });
  }
}
/**
 * GET /merchant/user-status
 * @param address user connect wallet address
 * @reason Get Statsu of kunstify-pay
 */
export async function getUserStatus(req: Request, res: Response) {
  const sudoAddress = req.query.address as string;
  if (!sudoAddress) {
    return res.json({ message: "User Address Requirement", profile: null, status: "landing" });
  }
  try {
    const address = sudoAddress?.toLowerCase();

    const userProfile = await Profile.findOne({ address }).select("_id");
    if (!userProfile) {
      return res.json({ status: "landing", profile: null });
    }
    const userId = userProfile?._id;
    const [kycDetails, directorConfig, latestConfig] = await Promise.all([
      BusinessKyc.findOne({ userId }).select("status"),
      PayConfig.findOne({
        "directors.address": address,
        "directors.isApproved": true,
      }).sort({ createdAt: -1 }),
      PayConfig.findOne({
        creatorAddress: address,
      }).sort({ createdAt: -1 }),
    ]);

    if (!kycDetails && !directorConfig) {
      return res.json({ status: "landing", profile: userId });
    }

    if (directorConfig) {
      return res.json({
        status: BusinessStatus.APPROVED,
        profile: userId,
        config: {
          address: directorConfig?.receiverAddress,
          redirectUrl: directorConfig?.redirectUrl,
        },
      });
    }
    if (!kycDetails) {
      return res.json({
        status: "init",
        profile: userId,
      });
    }
    // ❌ KYC not approved
    if (kycDetails.status !== BusinessStatus.APPROVED) {
      return res.json({
        status: kycDetails.status,
        profile: userId,
      });
    }

    // ✅ KYC approved → dashboard (config optional)
    return res.json({
      status: kycDetails.status,
      profile: userId,
      config: latestConfig
        ? {
            address: latestConfig.receiverAddress,
            redirectUrl: latestConfig.redirectUrl,
          }
        : null, // 👈 important
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /pay/active-user-key
 * @param id Key Object id
 * @reasone after geting key ,need to active
 */

export async function createSession(req: Request, res: Response) {
  try {
    const { publicKey, amount } = req.body;

    // 🔐 1. Validate input
    if (!publicKey || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // 🔐 2. Validate merchant via publicKey
    const config = await PayConfig.findOne({
      keys: {
        $elemMatch: {
          publicKey,
          isActive: true,
        },
      },
    });

    if (!config) {
      return res.status(401).json({
        success: false,
        message: "Invalid public key",
      });
    }

    // 🆔 3. Generate sessionId
    const sessionId = ethers.keccak256(ethers.randomBytes(32));

    // 💾 4. Create payment record
    await PayTx.create({
      sessionId,
      merchantId: config._id,
      mAmount: amount,
    });

    return res.status(200).json({
      success: true,
      data: {
        sessionId,

        checkoutUrl: `${BASE_URL}/kunstify-pay/checkout?sessionId=${sessionId}`,
      },
    });
  } catch (error) {
    console.error("Create Session Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

export async function createSubscriptionSession(req: Request, res: Response) {
  try {
    const { publicKey, amount, address, email, isMonthly } = req.body;

    const lowerUserAddress = address.toLowerCase();
    // ✅ Basic validation
    if (!publicKey || !address || !amount || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const config = await PayConfig.findOne({
      keys: {
        $elemMatch: {
          publicKey,
          isActive: true,
        },
      },
    });

    if (!config) {
      return res.status(401).json({
        success: false,
        message: "Invalid public key",
      });
    }
    const profile = await Profile.findOne({ address: config?.creatorAddress });
    const merchantConfig = await BusinessKyc.findOne({ userId: profile?._id });
    const url = await createRecurring({
      merchantId: config._id.toString(),
      amount,
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
    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error",
    });
  }
}
export async function getUserSessionDetails(req: Request, res: Response) {
  const { sessionId } = req.body;
  const SESSION_TTL = 30 * 60 * 1000;

  try {
    const session = await PayTx.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    const payConfig = await PayConfig.findById(session?.merchantId);
    const redirectUrl = payConfig?.redirectUrl;
    const isExpired = session.isSubscription ? false : Date.now() - new Date(session.createdAt!).getTime() > SESSION_TTL;

    const isSuccess = session.status === "success";

    return res.json({
      amount: session.mAmount,
      isExpired,
      isSuccess,
      redirectUrl,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
}
/**
 *
 * @param symbol The Token/chain  to convet
 * @param Amount Doz value Amount
 * @returns
 */
export async function getReviewDetails(req: Request, res: Response) {
  const { symbol, amountInDoz } = req.body;

  try {
    // ✅ Basic validation
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ message: "Invalid or missing symbol" });
    }

    if (!amountInDoz || isNaN(amountInDoz)) {
      return res.status(400).json({ message: "Invalid or missing amount" });
    }

    const dozAmount = Number(amountInDoz);

    if (dozAmount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    // ✅ DOZ price (USD)
    const dozDetails = await DozAdminModel.findById("admin").select("dozValueInUsd");
    const dozPrice = dozDetails?.dozValueInUsd ?? 0;

    if (!dozPrice) {
      return res.status(500).json({ message: "DOZ price not set" });
    }

    const tokenPrice = await getPriceBySymbol(symbol);

    const dozPerToken = tokenPrice / dozPrice;

    const tokenAmount = dozAmount / dozPerToken;

    return res.status(200).json({
      dozAmount,
      rate: dozPerToken,
      total: tokenAmount,
    });
  } catch (error) {
    console.error("getReviewDetails error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getCheckoutDetails(req: Request, res: Response) {
  const ZERO_ADDRESS = ethers.ZeroAddress;
  const { sessionId, address, amount, token, chainId } = req.body;

  try {
    const session = await PayTx.findOne({
      sessionId,
      status: PaymentStatus.PENDING,
    });

    if (!session) {
      return res.status(404).json({ message: "Invalid or expired session" });
    }

    const config = await PayConfig.findById(session?.merchantId);

    if (!config) {
      return res.status(400).json({ message: "Merchant config not active" });
    }

    const pricingModel = await Pricing.findOne({ pkgId: config?.pkgId ?? 0, mode: "business" });
    const FEE_BPS = pricingModel?.fee ?? 250;
    const chain = await Chain.findOne({ chainId, isActive: true });

    if (!chain) {
      return res.status(400).json({ message: "Unsupported chain" });
    }
    let decimals = 18;
    let isToken = false;
    let tokenAddress = ZERO_ADDRESS;
    if (token && token !== ZERO_ADDRESS) {
      const found = chain.tokens.find((t) => t.contractAddress.toLowerCase() === token.toLowerCase() && t.isActive);

      if (!found) {
        return res.status(400).json({ message: "Unsupported token" });
      }

      decimals = found.decimals;
      isToken = true;
      tokenAddress = found.contractAddress;
    }

    const amountWei = toWei(amount, decimals);

    const tokenAdd = isToken ? tokenAddress : ZERO_ADDRESS;

    // 5. Atomic update (important)
    const updated = await PayTx.findOneAndUpdate(
      { sessionId, status: PaymentStatus.PENDING },
      {
        chainId,
        amount: Number(amount),
        isToken,
        tokenAddress: isToken ? tokenAddress : undefined,
        senderAddress: address,
      },
      { new: true },
    );

    if (!updated) {
      return res.status(400).json({ message: "Failed to update session" });
    }

    const signature = await genaretPaySignature({
      sessionId: sessionId,
      buyer: address,
      merchant: config.receiverAddress,
      amount: amountWei,
      feeInBps: FEE_BPS,
      token: tokenAdd,
      chainId: updated.chainId!,
    });

    return res.json({
      sessionId: sessionId,
      merchant: config.receiverAddress,
      amount: amountWei,
      feeInBps: FEE_BPS,
      token: tokenAdd,
      chainId: updated.chainId,
      signature,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getDozPrice(req: Request, res: Response) {
  try {
    const data = await DozAdminModel.findById("admin");

    if (!data || !data.dozValueInEur) {
      return res.status(404).json({ message: "Doz price not found" });
    }

    return res.status(200).json({
      usd: data.dozValueInUsd ?? 0,
      eur: data.dozValueInEur ?? 0,
      gbp: data.dozValueInGbp ?? 0,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

export async function getSessionDetail(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;

    const payment = await PayTx.findOne({
      sessionId,
      merchantId: req.merchantId, // 🔥 critical
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    return res.json({
      sessionId: payment.sessionId,
      status: payment.status,

      // 🔥 safe fields (may be null)
      txHash: payment.txHash ?? null,
      amount: payment.amount ?? null,
      feeAmount: payment.feeAmount ?? null,
      chainId: payment.chainId ?? null,
      senderAddress: payment.senderAddress ?? null,

      isRefund: payment.isRefund ?? false,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

export async function getPoolingDetails(req: Request, res: Response) {
  try {
    const { status, updatedAfter, limit } = req.query;

    const numLimit = Math.min(Number(limit) || 20, 100);

    const filter: any = {
      merchantId: req.merchantId,
    };

    if (status) {
      filter.status = status;
    }

    if (updatedAfter) {
      filter.updatedAt = {
        $gt: new Date(Number(updatedAfter)),
      };
    }

    const payments = await PayTx.find(filter).sort({ updatedAt: -1 }).limit(numLimit);

    return res.json({
      count: payments.length,
      payments: payments.map((p) => ({
        sessionId: p.sessionId,
        status: p.status,

        // 🔥 safe nullable fields
        txHash: p.txHash ?? null,
        amount: p.amount ?? null,
        feeAmount: p.feeAmount ?? null,
        chainId: p.chainId ?? null,

        senderAddress: p.senderAddress ?? null,

        isRefund: p.isRefund ?? false,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

export async function getRefunded(req: Request, res: Response) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ message: "Missing tx id" });
  }

  try {
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tx id" });
    }

    const tx = await PayTx.findById(id);

    if (!tx) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // 🔒 Basic validations
    if (tx.status !== "success") {
      return res.status(400).json({ message: "Only successful payments can be refunded" });
    }

    if (tx.isRefund) {
      return res.status(400).json({ message: "Already refunded" });
    }

    if (!tx.senderAddress) {
      return res.status(400).json({ message: "Missing sender address" });
    }

    if (!tx.amount) {
      return res.status(400).json({ message: "Missing amount" });
    }

    if (!tx.chainId) {
      return res.status(400).json({ message: "Missing chainId" });
    }

    // ======================================================
    // 🔥 HANDLE DECIMALS SAFELY
    // ======================================================

    let decimals = 18;
    let tokenAddress = ZeroAddress; // native default

    if (tx.isToken) {
      if (!tx.tokenAddress) {
        return res.status(400).json({ message: "Token address missing" });
      }

      const chain = await Chain.findOne({ chainId: tx.chainId });

      if (!chain) {
        return res.status(404).json({ message: "Chain config not found" });
      }

      const token = chain.tokens.find((t) => t.contractAddress.toLowerCase() === tx.tokenAddress!.toLowerCase());

      if (!token) {
        return res.status(404).json({ message: "Token not supported" });
      }

      decimals = token.decimals;
      tokenAddress = token.contractAddress;
    }

    // ======================================================
    // 🔥 SAFE AMOUNT CONVERSION (NO FLOAT BUG)
    // ======================================================

    // Convert number -> string to avoid JS precision issues
    const amountStr = tx.amount.toString();

    let parsedAmount: bigint;

    try {
      parsedAmount = parseUnits(amountStr, decimals);
    } catch (err) {
      return res.status(400).json({
        message: "Failed to parse amount. Invalid precision.",
      });
    }

    // ======================================================
    // 🔥 GENERATE SIGNATURE
    // ======================================================

    const signature = await genaretPayRefundSignature({
      sessionId: tx.sessionId,
      amount: parsedAmount.toString(),
      token: tokenAddress,
      receiver: tx.senderAddress,
    });

    // ======================================================
    // ✅ RESPONSE
    // ======================================================

    return res.json({
      sessionId: tx.sessionId,
      amount: parsedAmount.toString(), // bigint string
      token: tokenAddress,
      receiver: tx.senderAddress,
      chainId: tx.chainId,
      signature,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
}
export async function getFilterChainRegister(req: Request, res: Response) {
  try {
    const { chainId, sessionId } = req.query;

    if (!chainId) {
      return res.status(400).json({ message: "chainId is required" });
    }

    const parsedChainId = Number(chainId);

    // ✅ Get transaction with populate
    const tx = await PayTx.findOne({ sessionId }).populate("merchantId").lean<TxWithMerchant>();

    const creatorAddress = tx?.merchantId?.creatorAddress;
    if (!tx) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // ✅ Get profile
    const profile = await Profile.findOne({
      address: creatorAddress,
    }).lean();

    // ✅ Get KYC
    const businessKyc = await BusinessKyc.findOne({
      userId: profile?._id,
    }).lean();

    const isEurope = businessKyc?.regions?.includes("Europe");

    // ✅ Get chain
    const chain = await Chain.findOne({
      chainId: parsedChainId,
      isActive: true,
    }).lean();

    if (!chain) {
      return res.status(200).json({ data: [] });
    }

    let tokens = chain.tokens ?? [];

    // ✅ Filter USDT for Europe
    if (isEurope) {
      tokens = tokens.filter((token) => token.symbol.toUpperCase() !== "USDT");
    }

    return res.status(200).json({
      data: tokens,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
}
