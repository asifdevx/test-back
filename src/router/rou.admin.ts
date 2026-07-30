import { Router } from "express";

import { getDozSwapRestrictionStatus, listPositions, logMint, logRemove, updateDozSwapRestrictionStatus } from "../mongoDb/controllers/c.admin-poolAdmin";
import { Request,Response } from "express";
import { exportSwapTransactionsCsv, listSwapTransactions } from "../mongoDb/controllers/c.admin-swapTx";
import { getAllChains, getTokenCardDetails, getTokenDetail } from "../mongoDb/controllers/c.swap";
import { Chain } from "../mongoDb/schemas/sch.paymentChain";
import { CHAIN_SLUG, NATIVE_TOKENS } from "../config/chains";
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

    return res.json(result);
  } catch (error) {
    console.error("Controller error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
router.get("/tokens/:chainId/:contractAddress",async (req:Request,res:Response)=>{
  try {
    const chainId = Number(req.params.chainId);
    const rawAddress = req.params.contractAddress as string;
    const isNative = rawAddress === "native";
    const contractAddress = isNative ? null : rawAddress?.toLowerCase();

    if (!chainId || (!isNative && !contractAddress)) {
      return res.status(400).json({ message: "chainId and contractAddress are required" });
    }

    const cacheKey = isNative ? `token:detail:${chainId}:native` : `token:detail:${chainId}:${contractAddress}`;
   

    const chain = await Chain.findOne({ chainId, isActive: true });
    if (!chain) return res.status(404).json({ message: "Chain not found" });

    if (isNative) {
      const nativeCfg = NATIVE_TOKENS[chain.chainId];
      if (!nativeCfg) return res.status(404).json({ message: "Native token not configured for this chain" });

      const chainName = getSlug(chain.chainId);
      const url = `${DEX_BASE}/token-pairs/v1/${chainName}/${nativeCfg.wrappedAddress}`;

      const baseShape = {
        chainId,
        name: nativeCfg.name,
        symbol: nativeCfg.symbol,
        contractAddress: "native",
        chartAddress: nativeCfg.wrappedAddress,
        imgUrl: nativeCfg.logo,
        isNative: true,
      };

      let pairs: any[] = [];
      try {
        const { data } = await axios.get(url, { timeout: 5000 });
        pairs = data ?? [];
      } catch (err) {
        console.error("DexScreener fetch failed (native):", err);
        return res.json({ ...baseShape, priceUsd: null, liquidity: null, marketCap: null });
      }
      if (!pairs.length) return res.json({ ...baseShape, priceUsd: null, liquidity: null });

      const bestPair = pairs.reduce((best: any, cur: any) => (!best || (cur.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? cur : best), null);

      const result = {
        ...baseShape,
        priceUsd: bestPair?.priceUsd ? Number(bestPair.priceUsd) : null,
        priceChange1h: bestPair?.priceChange?.h1 ?? null,
        priceChange6h: bestPair?.priceChange?.h6 ?? null,
        priceChange24h: bestPair?.priceChange?.h24 ?? null,
        marketCap: bestPair?.marketCap ?? bestPair?.fdv ?? null,
        fdv: bestPair?.fdv ?? null,
        liquidity: bestPair?.liquidity?.usd ?? null,
        volume24h: bestPair?.volume?.h24 ?? null,
        txns24h: (bestPair?.txns?.h24?.buys ?? 0) + (bestPair?.txns?.h24?.sells ?? 0),
        buys24h: bestPair?.txns?.h24?.buys ?? null,
        sells24h: bestPair?.txns?.h24?.sells ?? null,
        pairAddress: bestPair?.pairAddress ?? null,
        pairCreatedAt: bestPair?.pairCreatedAt ? Math.floor(bestPair.pairCreatedAt / 1000) : null,
        website: bestPair?.info?.websites?.[0]?.url ?? null,
        twitter: bestPair?.info?.socials?.find((s: any) => s.type === "twitter")?.url ?? null,
        telegram: bestPair?.info?.socials?.find((s: any) => s.type === "telegram")?.url ?? null,
      };
 
      return res.json(result);
    }

    const dbToken = chain.tokens.find((t) => t.contractAddress.toLowerCase() === contractAddress && t.isActive);

    
    if (!dbToken) {
      return res.status(404).json({ message: "Token not found in chain" });
    }

    if (isDozToken(chainId, contractAddress as string)) {
      try {
        const dozData = await getDozMarketData();
        const result = {
          chainId,
          name: dbToken.name,
          symbol: dbToken.symbol,
          contractAddress: dbToken.contractAddress,
          imgUrl: dbToken.imgUrl ?? null,
          priceUsd: dozData.priceUsd,
          priceChange1h: null as number | null,
          priceChange6h: null as number | null,
          priceChange24h: dozData.priceChange24h,
          marketCap: dozData.marketCap,
          fdv: dozData.marketCap,
          liquidity: dozData.liquidity,
          volume24h: dozData.volume24h,
          txns24h: dozData.txns24h,
          buys24h: null as number | null,
          sells24h: null as number | null,
          pairAddress: null as string | null,
          pairCreatedAt: null as number | null,
          website: "http://ounce.digital",
          twitter: null as string | null,
          telegram: null as string | null,
        };

        
        return res.json(result);
      } catch (err) {
        console.error("Failed to load DOZ market data, falling back to DexScreener path:", err);
        // fall through — worst case DexScreener also has nothing and we return nulls, same as before
      }
    }

    // ─────────────────────────────
    // 3. FETCH FROM DEXSCREENER (CORRECT ENDPOINT)
    // ─────────────────────────────
    const chainName = getSlug(chain.chainId);

    const url = `${DEX_BASE}/token-pairs/v1/${chainName}/${contractAddress}`;

    let pairs: any[] = [];

    try {
      const { data } = await axios.get(url, { timeout: 5000 });
      pairs = data ?? [];
    } catch (err) {
      console.error("DexScreener fetch failed:", err);
      return res.json({
        chainId,
        name: dbToken.name,
        symbol: dbToken.symbol,
        contractAddress: dbToken.contractAddress,
        imgUrl: dbToken.imgUrl ?? null,
        priceUsd: null,
        liquidity: null,
        marketCap: null,
      });
    }

    if (!pairs.length) {
      return res.json({
        chainId,
        name: dbToken.name,
        symbol: dbToken.symbol,
        contractAddress: dbToken.contractAddress,
        imgUrl: dbToken.imgUrl ?? null,
        priceUsd: null,
        liquidity: null,
      });
    }

    // ─────────────────────────────
    // 4. BEST PAIR (highest liquidity)
    // ─────────────────────────────
    const bestPair = pairs.reduce((best: any, current: any) => {
      if (!best) return current;
      return (current.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? current : best;
    }, null);

    // ─────────────────────────────
    // 5. NORMALIZE RESPONSE
    // ─────────────────────────────
    const result = {
      chainId,
      name: dbToken.name,
      symbol: dbToken.symbol,
      contractAddress: dbToken.contractAddress,
      imgUrl: dbToken.imgUrl ?? null,

      priceUsd: bestPair?.priceUsd ? Number(bestPair.priceUsd) : null,

      priceChange1h: bestPair?.priceChange?.h1 ?? null,
      priceChange6h: bestPair?.priceChange?.h6 ?? null,
      priceChange24h: bestPair?.priceChange?.h24 ?? null,

      marketCap: bestPair?.marketCap ?? bestPair?.fdv ?? null,
      fdv: bestPair?.fdv ?? null,
      liquidity: bestPair?.liquidity?.usd ?? null,
      volume24h: bestPair?.volume?.h24 ?? null,

      txns24h: (bestPair?.txns?.h24?.buys ?? 0) + (bestPair?.txns?.h24?.sells ?? 0),

      buys24h: bestPair?.txns?.h24?.buys ?? null,
      sells24h: bestPair?.txns?.h24?.sells ?? null,

      pairAddress: bestPair?.pairAddress ?? null,

      pairCreatedAt: bestPair?.pairCreatedAt ? Math.floor(bestPair.pairCreatedAt / 1000) : null,

      website: bestPair?.info?.websites?.[0]?.url ?? null,

      twitter: bestPair?.info?.socials?.find((s: any) => s.type === "twitter")?.url ?? null,
      linkedin: bestPair?.info?.socials?.find((s: any) => s.type === "LinkedIn")?.url ?? null,

      telegram: bestPair?.info?.socials?.find((s: any) => s.type === "telegram")?.url ?? null,
    };

    // ─────────────────────────────
    // 6. CACHE
    // ─────────────────────────────
 

    return res.json(result);
  } catch (error) {
    console.error("getTokenDetail error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
})
export default router;
