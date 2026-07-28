import { Request, Response } from "express";
import { redis } from "../../config/redis";
import { DOZ_SWAP_RESTRICTION_KEY, DozSwapDirectionLock, DozSwapRestriction } from "../schemas/sch.dozswaprestriction";
import { PoolPosition } from "../schemas/sch.poolPosition";

export async function logMint(req: Request, res: Response) {
  const owner = req.user?.address;
  if (!owner) {
    return res.status(401).json({ code: "NO_USER", message: "Unauthorized" });
  }

  const { poolAddress, routerAddress, tickLower, tickUpper, liquidity, txHash } = req.body;

  if (!poolAddress || !routerAddress || typeof tickLower !== "number" || typeof tickUpper !== "number" || !liquidity || !txHash) {
    return res.status(400).json({
      code: "MISSING_FIELDS",
      message: "poolAddress, routerAddress, tickLower, tickUpper, liquidity, txHash are required",
    });
  }

  const doc = await PoolPosition.findOneAndUpdate(
    { owner: owner.toLowerCase(), poolAddress: poolAddress.toLowerCase(), tickLower, tickUpper },
    {
      $set: { routerAddress: routerAddress.toLowerCase(), liquidity: String(liquidity), status: "active", lastTxHash: txHash },
      $setOnInsert: { mintTxHash: txHash },
    },
    { upsert: true, new: true },
  );

  res.json({ success: true, position: doc });
}

/**
 * Called by the frontend right after a burnAndCollect tx confirms.
 * `remainingLiquidity` should be whatever the contract reports post-burn
 * (e.g. from a fresh getPositionInfo read) — trust the chain, not arithmetic
 * done client-side against a possibly-stale liquidity figure.
 */
export async function logRemove(req: Request, res: Response) {
  const owner = req.user?.address;
  if (!owner) {
    return res.status(401).json({ code: "NO_USER", message: "Unauthorized" });
  }

  const { poolAddress, tickLower, tickUpper, remainingLiquidity, txHash } = req.body;

  if (!poolAddress || typeof tickLower !== "number" || typeof tickUpper !== "number" || !txHash) {
    return res.status(400).json({
      code: "MISSING_FIELDS",
      message: "poolAddress, tickLower, tickUpper, txHash are required",
    });
  }

  const isFullyRemoved = !remainingLiquidity || remainingLiquidity === "0";

  const doc = await PoolPosition.findOneAndUpdate(
    { owner: owner.toLowerCase(), poolAddress: poolAddress.toLowerCase(), tickLower, tickUpper },
    {
      $set: {
        liquidity: isFullyRemoved ? "0" : String(remainingLiquidity),
        status: isFullyRemoved ? "removed" : "active",
        lastTxHash: txHash,
        ...(isFullyRemoved ? { removeTxHash: txHash } : {}),
      },
    },
    { new: true },
  );

  if (!doc) {
    return res.status(404).json({ code: "NOT_FOUND", message: "No tracked position for this range" });
  }

  res.json({ success: true, position: doc });
}

/**
 * Feeds the Remove Liquidity picker. Defaults to the caller's own active
 * positions; pass ?owner=all to see everyone's (useful since this is an
 * internal admin tool, not a per-user dashboard).
 */
export async function listPositions(req: Request, res: Response) {
  const requester = req.user?.address;
  if (!requester) {
    return res.status(401).json({ code: "NO_USER", message: "Unauthorized" });
  }

  const ownerParam = (req.query.owner as string | undefined)?.toLowerCase();
  const status = (req.query.status as string | undefined) || "active";

  const filter: Record<string, unknown> = { status };
  if (ownerParam && ownerParam !== "all") {
    filter.owner = ownerParam;
  } else if (!ownerParam) {
    filter.owner = requester.toLowerCase();
  }

  const positions = await PoolPosition.find(filter).sort({ updatedAt: -1 }).limit(200);
  res.json({ positions });
}

const CACHE_KEY = "doz:swap:restriction:mode";

export async function getDozSwapRestrictionMode(): Promise<DozSwapDirectionLock> {
  const cached = await redis?.get(CACHE_KEY);
  if (cached) return cached as DozSwapDirectionLock;

  const doc = await DozSwapRestriction.findOne({ key: DOZ_SWAP_RESTRICTION_KEY }).lean();
  const mode = doc?.mode ?? DozSwapDirectionLock.NONE;

  await redis?.set(CACHE_KEY, mode, "EX", 15);

  return mode;
}

export async function setDozSwapRestrictionMode(mode: DozSwapDirectionLock, updatedBy?: string, reason?: string) {
  const doc = await DozSwapRestriction.findOneAndUpdate({ key: DOZ_SWAP_RESTRICTION_KEY }, { $set: { mode, updatedBy, reason: reason ?? "" } }, { upsert: true, new: true });

  try {
    await redis?.del(CACHE_KEY);
  } catch {}

  return doc;
}

export async function getDozSwapRestrictionStatus(req: Request, res: Response) {
  try {
    const mode = await getDozSwapRestrictionMode();
    return res.json({ success: true, data: { mode } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export async function updateDozSwapRestrictionStatus(req: Request, res: Response) {
  try {
    const { mode, reason } = req.body as { mode?: string; reason?: string };

    if (!mode || !Object.values(DozSwapDirectionLock).includes(mode as DozSwapDirectionLock)) {
      return res.status(400).json({
        success: false,
        message: `mode must be one of: ${Object.values(DozSwapDirectionLock).join(", ")}`,
      });
    }

    const updatedBy = req?.user?.address;
    const doc = await setDozSwapRestrictionMode(mode as DozSwapDirectionLock, updatedBy, reason);

    return res.json({ success: true, data: { mode: doc.mode, reason: doc.reason, updatedBy: doc.updatedBy } });
  } catch (error) {
    console.error("updateDozSwapRestrictionStatus error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}
