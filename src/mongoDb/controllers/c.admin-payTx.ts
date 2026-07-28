import axios from "axios";
import { Request, Response } from "express";
import { emailQueue } from "../../redis/queues";
import { reimbursementDemandEmail } from "../../utils/emailTemplet";
import { BusinessKyc } from "../schemas/sch.businessKyc";
import { PayTx } from "../schemas/sch.payTx";
import { Profile } from "../schemas/sch.userProfile";
type TxWithMerchant = {
  sessionId: string;
  mAmount: number;
  merchantId: {
    creatorAddress: string;
  };
};

async function getPayTransaction(req: Request, res: Response) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query as any;

    const pageNumber = Number(page);
    const pageSize = Number(limit);

    const pipeline: any[] = [
      {
        $lookup: {
          from: "payconfigs",
          localField: "merchantId",
          foreignField: "_id",
          as: "merchant",
        },
      },
      { $unwind: { path: "$merchant", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "profiles",
          localField: "merchant.creatorAddress",
          foreignField: "address",
          as: "profile",
        },
      },
      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "businesskycs",
          localField: "profile._id",
          foreignField: "userId",
          as: "business",
        },
      },
      { $unwind: { path: "$business", preserveNullAndEmptyArrays: true } },

      // 🔗 Chain lookup (NEW)
      {
        $lookup: {
          from: "chains",
          localField: "chainId",
          foreignField: "chainId",
          as: "chain",
        },
      },
      { $unwind: { path: "$chain", preserveNullAndEmptyArrays: true } },

      // 🔍 search
      ...(search
        ? [
            {
              $match: {
                $or: [{ sessionId: { $regex: search, $options: "i" } }, { txHash: { $regex: search, $options: "i" } }, { "business.companyName": { $regex: search, $options: "i" } }],
              },
            },
          ]
        : []),

      // 🧠 extract tokenSymbol
      {
        $addFields: {
          tokenSymbol: {
            $let: {
              vars: {
                matchedToken: {
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
              in: "$$matchedToken.symbol",
            },
          },
        },
      },

      // 📉 sort
      { $sort: { createdAt: -1 } },

      // 📄 pagination
      {
        $facet: {
          data: [{ $skip: (pageNumber - 1) * pageSize }, { $limit: pageSize }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await PayTx.aggregate(pipeline);

    const data = result[0]?.data || [];
    const total = result[0]?.totalCount[0]?.count || 0;

    const hasMore = pageNumber * pageSize < total;

    const formatted = data.map((tx: any) => ({
      id: tx?._id,
      sessionId: tx.sessionId,
      merchantId: tx.merchantId.toString(),
      companyName: tx.business?.companyName || null,

      mAmount: tx.mAmount,
      chainId: tx.chainId,

      amount: tx.amount,
      isToken: tx.isToken,
      tokenAddress: tx.tokenAddress,

      tokenSymbol: tx.tokenSymbol || null, // ✅ NEW
      isRefund: tx?.isRefund || false,
      senderAddress: tx.senderAddress,
      txHash: tx.txHash,

      status: tx.status,
      feeAmount: tx.feeAmount,

      createdAt: new Date(tx.createdAt).toISOString(),
    }));

    return res.status(200).json({
      data: formatted,
      nextPage: hasMore ? pageNumber + 1 : null,
      total,
    });
  } catch (error) {
    console.error("getPayTransaction error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

async function handleNofifyTxReturn(req: Request, res: Response) {
  try {
    const { id, publicKey } = req.body;

    // 🔐 1. Validate input
    if (!id || !publicKey) {
      return res.status(400).json({ message: "Missing id or publicKey" });
    }

    // 🔎 3. Fetch transaction
    const payTxDetails = await PayTx.findById(id).populate("merchantId", "creatorAddress").lean<TxWithMerchant>();
    if (!payTxDetails) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // 🔎 4. Get profile (email)
    const profileDetails = await Profile.findOne({
      address: payTxDetails.merchantId?.creatorAddress,
    }).lean();
    const merchantDeails = await BusinessKyc.findOne({ userId: profileDetails?._id });

    if (!profileDetails?.email) {
      return res.status(404).json({ message: "Merchant email not found" });
    }

    // 🔁 5. Create session (internal call)
    let checkoutUrl: string;

    try {
      const { data } = await axios.post("https://api.kunstify.io/pay/session/create", {
        publicKey,
        amount: payTxDetails.mAmount,
      });
     

      checkoutUrl = data?.data?.checkoutUrl;

      if (!checkoutUrl) {
        throw new Error("Invalid checkout response");
      }
    } catch (err: any) {
      console.error("Session creation failed:", err?.response?.data || err.message);

      return res.status(500).json({
        message: "Failed to create refund session",
      });
    }

    // 📧 6. Send email via queue
    await emailQueue.add("refund-email", {
      to: profileDetails.email,
      subject: "URGENT: Legal Notice - Reimbursement Required (Kunstify Pay)",
      html: reimbursementDemandEmail({
        merchantName: merchantDeails?.companyName || "Merchant",
        amountDoz: payTxDetails.mAmount, // Ensure this is converted to a readable number if it's in Wei
        sessionId: payTxDetails.sessionId,
        checkoutUrl: checkoutUrl,
      }),
    });

    // ✅ 7. Response
    return res.status(200).json({
      success: true,
      checkoutUrl,
    });
  } catch (error: any) {
    console.error("handleNofifyTxReturn error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export { getPayTransaction, handleNofifyTxReturn };
