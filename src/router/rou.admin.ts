import { Router } from "express";

import { getDozSwapRestrictionStatus, listPositions, logMint, logRemove, updateDozSwapRestrictionStatus } from "../mongoDb/controllers/c.admin-poolAdmin";
import { Request,Response } from "express";
import { exportSwapTransactionsCsv, listSwapTransactions } from "../mongoDb/controllers/c.admin-swapTx";
import { getAllChains, getTokenCardDetails, getTokenDetail } from "../mongoDb/controllers/c.swap";
import { Chain } from "../mongoDb/schemas/sch.paymentChain";
import { CHAIN_SLUG, NATIVE_TOKENS } from "../config/chains";
import axios from "axios";
import { DEX_BASE } from "../config/base";
import { ADDRESS_RE, DOZ_AVAX_CHAIN_ID, DOZ_TOKEN_ADDRESS, MAX_SLIPPAGE_BPS, MIN_SLIPPAGE_BPS, NATIVE_ADDRESS } from "../config/swap.config";
import { getDozMarketData } from "../services/dozPricingService";
import { UnifiedQuoteRequest } from "../types";
import { SwapErrorCode } from "../utils/swapErrors";
import { Pricing, PricingMode } from "../mongoDb/schemas/sch.pricing";
import { SubscriptionModel } from "../mongoDb/schemas/sch.user-subscription";
import { getMayanQuote } from "../services/mayan.service";
import { getOpenOceanQuote } from "../services/openOcean.service";
import { getRelayQuote } from "../services/relay.service";
import { getZeroExQuote } from "../services/zeroEx.service";
import { buildDozSwapTx } from "../services/dozAmm.service";
import { SwapTransaction } from "../mongoDb/schemas/sch.swapTx";


const router = Router();
const getSlug = (chainId: number) => (chainId === 1329 ? "seiv2" : CHAIN_SLUG[chainId]);
function isDozToken(chainId: number, address: string): boolean {
  return chainId === DOZ_AVAX_CHAIN_ID && address.toLowerCase() === DOZ_TOKEN_ADDRESS.toLowerCase();
}

type SwapServiceError = Error & {
  code: SwapErrorCode;
  statusCode: number;
};
function isValidAddress(addr: string): boolean {
  return addr.toLowerCase() === NATIVE_ADDRESS || ADDRESS_RE.test(addr);
}
async function handleSingleDozOrRoute(parsed: UnifiedQuoteRequest, feeBps: number) {
  if (isDozAvaxPair(parsed)) {
    const built = await buildDozSwapTx({
      fromTokenAddress: parsed.fromTokenAddress,
      toTokenAddress: parsed.toTokenAddress,
      amountInRaw: parsed.fromAmount,
      slippageBps: parsed.slippageBps ?? 100,
      feeBps,
    });

    return {
      route: "doz-amm",
      toolName: "DOZ/AVAX AMM",
      isCrossChain: false,
      fromToken: { address: parsed.fromTokenAddress, symbol: "", decimals: 0, chainId: parsed.fromChainId },
      toToken: { address: parsed.toTokenAddress, symbol: "", decimals: 0, chainId: parsed.toChainId },
      fromAmount: parsed.fromAmount,
      toAmount: built.amountOut,
      toAmountMin: built.amountOutMinimum,
      feeBps,
      feeAmount: built.feeAmount,
      feeToken: parsed.fromTokenAddress,
      executionDurationSeconds: 5,
      transactionRequest: { chainId: parsed.fromChainId, to: built.to, data: built.data, value: built.value },
      approval: built.approval,
      dozAmmMeta: { zeroForOne: built.zeroForOne, sqrtPriceX96After: built.sqrtPriceX96After, partialFill: built.partialFill },
    };
  }
  
}

function createSwapServiceError(
  code: SwapErrorCode,
  message: string,
  statusCode: number
): SwapServiceError {
  const error = new Error(message) as SwapServiceError;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function createValidationError(message: string): SwapServiceError {
  const error = createSwapServiceError(SwapErrorCode.INVALID_PARAMS, message, 400);
  error.name = "ValidationError";
  return error;
}
function isDozAvaxPair(req: UnifiedQuoteRequest): boolean {
  if (req.fromChainId !== DOZ_AVAX_CHAIN_ID || req.toChainId !== DOZ_AVAX_CHAIN_ID) return false;

  const from = req.fromTokenAddress.toLowerCase();
  const to = req.toTokenAddress.toLowerCase();
  const doz = DOZ_TOKEN_ADDRESS.toLowerCase();
  return (from === doz && to === NATIVE_ADDRESS) || (from === NATIVE_ADDRESS && to === doz);
}

function parseRequest(req: Request): UnifiedQuoteRequest {
  const q = { ...req.query, ...req.body } as Record<string, string>;
  const required = ["fromChainId", "toChainId", "fromTokenAddress", "toTokenAddress", "fromAmount", "fromAddress"];
  for (const key of required) {
    if (q[key] === undefined || q[key] === null || q[key] === "") {
      throw  createValidationError(`Missing required param: ${key}`);
    }
  }

  const fromChainId = Number(q.fromChainId);
  const toChainId = Number(q.toChainId);
  if (!Number.isInteger(fromChainId) || fromChainId <= 0) throw  createValidationError("fromChainId must be a positive integer");
  if (!Number.isInteger(toChainId) || toChainId <= 0) throw  createValidationError("toChainId must be a positive integer");

  if (!isValidAddress(q.fromTokenAddress)) throw  createValidationError("fromTokenAddress is not a valid address");
  if (!isValidAddress(q.toTokenAddress)) throw  createValidationError("toTokenAddress is not a valid address");
  if (!ADDRESS_RE.test(q.fromAddress)) throw  createValidationError("fromAddress is not a valid wallet address");
  if (q.toAddress && !ADDRESS_RE.test(q.toAddress)) throw  createValidationError("toAddress is not a valid wallet address");

  if (q.fromTokenAddress.toLowerCase() === q.toTokenAddress.toLowerCase() && fromChainId === toChainId) {
    throw  createValidationError("fromTokenAddress and toTokenAddress must be different");
  }

  // fromAmount must be a positive integer string (raw base units) — reject decimals,
  // negative numbers, scientific notation, and anything that isn't a clean bigint.
  if (!/^\d+$/.test(q.fromAmount)) throw  createValidationError("fromAmount must be a positive integer string (raw base units)");
  let fromAmountBig: bigint;
  try {
    fromAmountBig = BigInt(q.fromAmount);
  } catch {
    throw  createValidationError("fromAmount is not a valid integer");
  }
  if (fromAmountBig <= 0n) throw  createValidationError("fromAmount must be greater than 0");

  let slippageBps: number | undefined;
  if (q.slippageBps !== undefined) {
    slippageBps = Number(q.slippageBps);
    if (!Number.isFinite(slippageBps) || slippageBps < MIN_SLIPPAGE_BPS || slippageBps > MAX_SLIPPAGE_BPS) {
      throw  createValidationError(`slippageBps must be between ${MIN_SLIPPAGE_BPS} and ${MAX_SLIPPAGE_BPS}`);
    }
  }

  let fromTokenDecimals: number | undefined;
  if (q.fromTokenDecimals !== undefined) {
    fromTokenDecimals = Number(q.fromTokenDecimals);
    if (!Number.isInteger(fromTokenDecimals) || fromTokenDecimals < 0 || fromTokenDecimals > 36) {
      throw  createValidationError("fromTokenDecimals is out of range");
    }
  }

  const routeHint = q.routeHint as UnifiedQuoteRequest["routeHint"] | undefined;
  if (routeHint && !["doz", "aggregate", "bridge"].includes(routeHint)) {
    throw  createValidationError(`Unknown routeHint: ${routeHint}`);
  }

  return {
    routeHint,
    fromChainId,
    toChainId,
    fromTokenAddress: q.fromTokenAddress,
    toTokenAddress: q.toTokenAddress,
    fromAmount: q.fromAmount,
    fromAddress: q.fromAddress,
    toAddress: q.toAddress || undefined,
    slippageBps,
    fromTokenDecimals,
  };
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
router.get("/swap/tokens",async (req:Request,res:Response)=>{
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
router.get("/swap/tokens/:chainId/:contractAddress",async (req:Request,res:Response)=>{
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

router.post("/swap/quote",async (req:Request,res:Response)=>{
  let parsed: UnifiedQuoteRequest;

  try {
    parsed = parseRequest(req);
  } catch (e) {
       return res.status(400).json({message:"Parsed failed "});

  }

  let FEE_BPS = 250;
  const userFeeDetails = await SubscriptionModel.findOne({ address: req?.user?.address });
  const subscriptionMOdel = await Pricing.findOne({ mode: PricingMode.NFT, pkgId: userFeeDetails?.packages?.nft?.pkgId ?? 0 });
  if (subscriptionMOdel && subscriptionMOdel.fee && Number(subscriptionMOdel.fee)) FEE_BPS = subscriptionMOdel.fee;


  if (isDozAvaxPair(parsed)) {
    try {
      const data = await handleSingleDozOrRoute(parsed, FEE_BPS);
      return res.json({ success: true, data });
    } catch (e) {
             return res.status(400).json({message:"isDozAvaxPair failed "});

    }
  }

  const hint = parsed.routeHint ?? (parsed.fromChainId === parsed.toChainId ? "aggregate" : "bridge");

  try {
    if (hint === "doz") {
      if (!isDozAvaxPair(parsed)) {
        return res.status(400).json({ success: false, message: "routeHint=doz only supports the DOZ<->AVAX pair on Avalanche" });
      }
      const data = await handleSingleDozOrRoute(parsed, FEE_BPS);
      return res.json({ success: true, data });
    }

  

  
  } catch (e) {
    return res.status(500).json({message:"Internal server "});
  }
});
router.post("/swap/tx",async (req:Request,res:Response)=> {
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
});

export default router;
