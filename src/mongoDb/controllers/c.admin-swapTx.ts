import { Request, Response } from "express";
import { FilterQuery } from "mongoose";
import { SwapTransaction } from "../schemas/sch.swapTx";

const MAX_EXPORT_ROWS = 20_000;

interface SwapTxQuery {
  address?: string;
  txHash?: string;
  crossChain?: "cross" | "same" | string;
  chainId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  limit?: string;
}

interface CreateSwapTxBody {
  walletAddress?: string;
  isCrossChain?: boolean;
  route?: string;
  from?: {
    chainId: number;
    address: string;
    amount: string;
  };
  to?: {
    chainId: number;
    address: string;
    amount: string;
  };
  txHash?: string;
  explorerUrl?: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turns admin-panel query params into a Mongo filter. Shared by both the list
 * endpoint and the CSV export endpoint so "export" always matches what's on screen.
 */
function buildFilter(query: SwapTxQuery): FilterQuery<any> {
  const { address, txHash, crossChain, chainId, dateFrom, dateTo } = query;
  const filter: FilterQuery<any> = {};

  // Partial, case-insensitive match — lets the admin search by a fragment of an
  // address or hash, not just the exact full string.
  if (address) {
    filter.walletAddress = { $regex: escapeRegex(address.trim()), $options: "i" };
  }
  if (txHash) {
    filter.txHash = { $regex: escapeRegex(txHash.trim()), $options: "i" };
  }

  if (crossChain === "cross") filter.isCrossChain = true;
  else if (crossChain === "same") filter.isCrossChain = false;

  if (chainId) {
    const cid = Number(chainId);
    if (!Number.isNaN(cid)) {
      filter.$or = [{ "from.chainId": cid }, { "to.chainId": cid }];
    }
  }
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  return filter;
}

const enrichTokensPipeline = [
  {
    $lookup: {
      from: "chains", // Targets the 'chains' collection
      localField: "from.chainId",
      foreignField: "chainId",
      as: "fromChain",
    },
  },
  { $unwind: { path: "$fromChain", preserveNullAndEmptyArrays: true } },
  {
    $set: {
      "from.tokenDetails": {
        $arrayElemAt: [
          {
            $filter: {
              input: "$fromChain.tokens",
              as: "t",
              cond: { $eq: ["$$t.contractAddress", { $toLower: "$from.address" }] },
            },
          },
          0,
        ],
      },
    },
  },
  {
    $set: {
      "from.decimals": { $ifNull: ["$from.tokenDetails.decimals", "$from.decimals", 18] },
      "from.imgUrl": { $ifNull: ["$from.tokenDetails.imgUrl", "$from.imgUrl", ""] },
      "from.symbol": { $ifNull: ["$from.tokenDetails.symbol", "$from.symbol", ""] },
      "from.name": { $ifNull: ["$from.tokenDetails.name", "$from.name", ""] },
    },
  },

  // --- ENRICH 'TO' TOKEN ---
  {
    $lookup: {
      from: "chains",
      localField: "to.chainId",
      foreignField: "chainId",
      as: "toChain",
    },
  },
  { $unwind: { path: "$toChain", preserveNullAndEmptyArrays: true } },
  {
    $set: {
      "to.tokenDetails": {
        $arrayElemAt: [
          {
            $filter: {
              input: "$toChain.tokens",
              as: "t",
              cond: { $eq: ["$$t.contractAddress", { $toLower: "$to.address" }] },
            },
          },
          0,
        ],
      },
    },
  },
  {
    $set: {
      "to.decimals": { $ifNull: ["$to.tokenDetails.decimals", "$to.decimals", 18] },
      "to.imgUrl": { $ifNull: ["$to.tokenDetails.imgUrl", "$to.imgUrl", ""] },
      "to.symbol": { $ifNull: ["$to.tokenDetails.symbol", "$to.symbol", ""] },
      "to.name": { $ifNull: ["$to.tokenDetails.name", "$to.name", ""] },
    },
  },

  // Clean up temporary join fields
  {
    $unset: ["fromChain", "from.tokenDetails", "toChain", "to.tokenDetails"],
  },
];
function formatRawAmount(raw: string | undefined, decimals?: number): string {
  if (!raw) return "0";
  try {
    const d = Number.isFinite(decimals) ? (decimals as number) : 18;
    const negative = String(raw).startsWith("-");
    const bn = BigInt(negative ? String(raw).slice(1) : raw);
    const factor = BigInt(10) ** BigInt(d);
    const whole = bn / factor;
    const frac = bn % factor;
    if (frac === 0n) return `${negative ? "-" : ""}${whole.toString()}`;
    const fracStr = frac.toString().padStart(d, "0").replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
  } catch {
    return String(raw);
  }
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * GET /swap-tx
 * Admin list view — paginated, filtered, and aggregated natively in MongoDB.
 */
export const listSwapTransactions = async (req: Request<{}, any, any, SwapTxQuery>, res: Response): Promise<Response> => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10) || 20, 1), 100);
    const filter = buildFilter(req.query);

    const [items, total] = await Promise.all([
      SwapTransaction.aggregate([{ $match: filter }, { $sort: { createdAt: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, ...enrichTokensPipeline]),
      SwapTransaction.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (err) {
    console.error("❌ listSwapTransactions error:", err);
    return res.status(500).json({ success: false, message: "Failed to load swap transactions" });
  }
};

/**
 * GET /swap-tx/export
 * Aggregated lookup streamed out directly to a downloadable CSV structure.
 */
export const exportSwapTransactionsCsv = async (req: Request<{}, any, any, SwapTxQuery>, res: Response): Promise<Response | void> => {
  try {
    const filter = buildFilter(req.query);

    const items = await SwapTransaction.aggregate([{ $match: filter }, { $sort: { createdAt: -1 } }, { $limit: MAX_EXPORT_ROWS }, ...enrichTokensPipeline]);

    const header = ["Address", "Type", "From Chain ID", "From Token", "From Amount", "To Chain ID", "To Token", "To Amount", "Route", "Tx Hash", "Explorer URL", "Date (UTC)"];

    const rows = items.map((tx: any) => [
      tx.walletAddress,
      tx.isCrossChain ? "Cross-chain" : "Same-chain",
      tx.from?.chainId ?? "",
      tx.from?.symbol ?? "",
      formatRawAmount(tx.from?.amount, tx.from?.decimals),
      tx.to?.chainId ?? "",
      tx.to?.symbol ?? "",
      formatRawAmount(tx.to?.amount, tx.to?.decimals),
      tx.route ?? "",
      tx.txHash,
      tx.explorerUrl ?? "",
      tx.createdAt ? new Date(tx.createdAt).toISOString() : "",
    ]);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="swap-transactions-${Date.now()}.csv"`);

    return res.status(200).send("\uFEFF" + csv);
  } catch (err) {
    console.error("❌ exportSwapTransactionsCsv error:", err);
    return res.status(500).json({ success: false, message: "Failed to export swap transactions" });
  }
};

/**
 * POST /swap-tx
 * Called by the client immediately after a swap transaction confirms
 * on-chain. Upserts on txHash so duplicate calls cannot cause dual entries.
 */
export const createSwapTransaction = async (req: Request<{}, any, CreateSwapTxBody>, res: Response): Promise<Response> => {
  try {
    const { walletAddress, isCrossChain, route, from, to, txHash, explorerUrl } = req.body || {};

    if (!walletAddress || !txHash || !from?.address || !to?.address) {
      return res.status(400).json({ success: false, message: "Missing required swap transaction fields" });
    }

    const doc = await SwapTransaction.findOneAndUpdate(
      { txHash: String(txHash).toLowerCase() },
      {
        walletAddress: String(walletAddress).toLowerCase(),
        isCrossChain: !!isCrossChain,
        route: route || "",
        from,
        to,
        txHash: String(txHash).toLowerCase(),
        explorerUrl: explorerUrl || "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );

    return res.status(201).json({ success: true, data: doc });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(200).json({ success: true, message: "Already recorded" });
    }
    console.error("❌ createSwapTransaction error:", err);
    return res.status(500).json({ success: false, message: "Failed to record swap transaction" });
  }
};
