import { Router } from "express";

import { getDozSwapRestrictionStatus, listPositions, logMint, logRemove, updateDozSwapRestrictionStatus } from "../mongoDb/controllers/c.admin-poolAdmin";
import { Request,Response } from "express";
import { exportSwapTransactionsCsv, listSwapTransactions } from "../mongoDb/controllers/c.admin-swapTx";
import { getAllChains, getTokenCardDetails, getTokenDetail } from "../mongoDb/controllers/c.swap";
import { Chain } from "../mongoDb/schemas/sch.paymentChain";
import { CHAIN_SLUG } from "../config/chains";
import axios from "axios";
import { DEX_BASE } from "../config/base";
import { DOZ_AVAX_CHAIN_ID, DOZ_TOKEN_ADDRESS } from "../config/swap.config";
import { getDozMarketData } from "../services/dozPricingService";


const router = Router();
const getSlug = (chainId: number) => (chainId === 1329 ? "seiv2" : CHAIN_SLUG[chainId]);
function isDozToken(chainId: number, address: string): boolean {
  return chainId === DOZ_AVAX_CHAIN_ID && address.toLowerCase() === DOZ_TOKEN_ADDRESS.toLowerCase();
}
function toCardFields(pair: any) {
  return {
    priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
    priceChange24h: pair?.priceChange?.h24 ?? null,
    marketCap: pair?.marketCap ?? pair?.fdv ?? null,
    liquidity: pair?.liquidity?.usd ?? null,
    pairAddress: pair?.pairAddress ?? null, // needed by the chart later
  };
}
// ! ---- SWAP Tx
router.get("/admin/swap/tx", listSwapTransactions);
router.get("/admin/swapTx/export", exportSwapTransactionsCsv);


// ! ---- Pool /Admin Manager--------------
router.post("/admin/positions/mint", logMint);
router.post("/admin/positions/remove", logRemove);
router.get("/admin/positions", listPositions);
// router.get("/admin/positions/doz-restriction", getDozSwapRestrictionStatus);
// router.put("/admin/positions/doz-restriction", updateDozSwapRestrictionStatus);



router.get("/swap", async(req: Request, res: Response) =>{
  try {
    const chains = await Chain.find({ isActive: true }).lean();

    if (!chains.length) {
      return res.status(404).json({
        success: false,
        message: "No chains found",
        data: [],
      });
    }

    return res.json({
      success: true,
      message: "Chains fetched successfully",
      data: chains,
    });
  } catch (error) {
    console.error("GET /chains error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
router.get("/tokens",async (req:Request,res:Response)=>{
  try {
    const rawChainId = req.query.chainId;

    if (!rawChainId) {
      return res.status(400).json({ message: "chainId is required" });
    }

    const isAll = rawChainId === "all";
    // ─────────────────────────────
    // 2. DB FETCH
    // ─────────────────────────────
    const chains = isAll
      ? await Chain.find({ isActive: true })
      : await Chain.find({
          chainId: Number(rawChainId),
          isActive: true,
        });

    if (!chains.length) {
      return res.status(404).json({ message: "No chains found" });
    }

    const result: any[] = [];

    // ─────────────────────────────
    // 3. DEXSCRENER FETCH
    // ─────────────────────────────
    for (const chain of chains) {
      const tokens = chain.tokens.filter((t) => t.isActive).map((t) => t.contractAddress);

      if (!tokens.length) continue;
      const chainName = getSlug(chain.chainId);

      const url = `${DEX_BASE}/tokens/v1/${chainName}/${tokens.join(",")}`;

      let data;
      try {
        const resDex = await axios.get(url);
        data = resDex.data;
      } catch (err) {
        const error = err as Error;
        console.error("DexScreener failed:", error?.message);
        continue;
      }

      const pairs = data || [];

      // ─────────────────────────────
      // 4. BEST PAIR SELECTION
      // ─────────────────────────────
      const map = new Map<string, any>();

      for (const pair of pairs) {
        const addr = pair.baseToken.address.toLowerCase();

        const existing = map.get(addr);

        if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) {
          map.set(addr, pair);
        }
      }

      // ─────────────────────────────
      // 5. NORMALIZE
      // ─────────────────────────────

      const normalized = await Promise.all(
        chain.tokens
          .filter((t) => t.isActive)
          .map(async (t) => {
            // DOZ doesn't trade on DexScreener — it's only listed on our own pool,
            // so derive its card fields from on-chain + our swap history instead.
            if (isDozToken(chain.chainId, t.contractAddress)) {
              try {
                const dozData = await getDozMarketData();
                return {
                  chainId: chain.chainId,
                  name: t.name,
                  symbol: t.symbol,
                  contractAddress: t.contractAddress,
                  imgUrl: t.imgUrl,
                  priceUsd: dozData.priceUsd,
                  priceChange24h: dozData.priceChange24h,
                  marketCap: dozData.marketCap,
                  liquidity: dozData.liquidity,
                  pairAddress: null as string | null,
                };
              } catch (err) {
                console.error("Failed to load DOZ market data, falling back to empty fields:", err);
                // fall through to the DexScreener-shaped (empty) fields below rather than
                // taking down the whole token-card list over one bad RPC call
              }
            }

            const pair = map.get(t.contractAddress.toLowerCase());
            return {
              chainId: chain.chainId,
              name: t.name,
              symbol: t.symbol,
              contractAddress: t.contractAddress,
              imgUrl: t.imgUrl,
              ...toCardFields(pair),
            };
          }),
      );

      result.push(...normalized);
    }

    // ─────────────────────────────
    // 6. CACHE RESULT
    // ─────────────────────────────


    return res.json(result);
  } catch (error) {
    console.error("Controller error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
// router.get("/tokens/:chainId/:contractAddress", getTokenDetail);
export default router;
