import axios from "axios";
import { Request, Response } from "express";
import { DEX_BASE } from "../../config/base";
import { CHAIN_SLUG, NATIVE_TOKENS } from "../../config/chains";
import { ADDRESS_RE, DOZ_AVAX_CHAIN_ID, DOZ_TOKEN_ADDRESS, MAX_SLIPPAGE_BPS, MIN_SLIPPAGE_BPS, NATIVE_ADDRESS } from "../../config/swap.config";
import { buildDozSwapTx } from "../../services/dozAmm.service";

import { getDozMarketData } from "../../services/dozPricingService";
import { getMayanQuote } from "../../services/mayan.service";
import { getOpenOceanQuote } from "../../services/openOcean.service";
import { getRelayQuote } from "../../services/relay.service";
import { getZeroExQuote } from "../../services/zeroEx.service";
import { UnifiedQuoteRequest } from "../../types";
import { SwapErrorCode, SwapServiceError, toHttpStatus } from "../../utils/swapErrors";
import { Chain } from "../schemas/sch.paymentChain";
import { Pricing, PricingMode } from "../schemas/sch.pricing";
import { SubscriptionModel } from "../schemas/sch.user-subscription";

function toCardFields(pair: any) {
  return {
    priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
    priceChange24h: pair?.priceChange?.h24 ?? null,
    marketCap: pair?.marketCap ?? pair?.fdv ?? null,
    liquidity: pair?.liquidity?.usd ?? null,
    pairAddress: pair?.pairAddress ?? null, // needed by the chart later
  };
}

const getSlug = (chainId: number) => (chainId === 1329 ? "seiv2" : CHAIN_SLUG[chainId]);

export async function getTokenCardDetails(req: Request, res: Response) {
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
}

// Route: GET /swap/tokens/:chainId/:contractAddress

export async function getTokenDetail(req: Request, res: Response) {
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
}

// Route: GET /swap/
export async function getAllChains(req: Request, res: Response) {
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
}
class ValidationError extends SwapServiceError {
  constructor(message: string) {
    super(SwapErrorCode.INVALID_PARAMS, message, 400);
    this.name = "ValidationError";
  }
}

function isValidAddress(addr: string): boolean {
  return addr.toLowerCase() === NATIVE_ADDRESS || ADDRESS_RE.test(addr);
}

function parseRequest(req: Request): UnifiedQuoteRequest {
  const q = { ...req.query, ...req.body } as Record<string, string>;
  const required = ["fromChainId", "toChainId", "fromTokenAddress", "toTokenAddress", "fromAmount", "fromAddress"];
  for (const key of required) {
    if (q[key] === undefined || q[key] === null || q[key] === "") {
      throw new ValidationError(`Missing required param: ${key}`);
    }
  }

  const fromChainId = Number(q.fromChainId);
  const toChainId = Number(q.toChainId);
  if (!Number.isInteger(fromChainId) || fromChainId <= 0) throw new ValidationError("fromChainId must be a positive integer");
  if (!Number.isInteger(toChainId) || toChainId <= 0) throw new ValidationError("toChainId must be a positive integer");

  if (!isValidAddress(q.fromTokenAddress)) throw new ValidationError("fromTokenAddress is not a valid address");
  if (!isValidAddress(q.toTokenAddress)) throw new ValidationError("toTokenAddress is not a valid address");
  if (!ADDRESS_RE.test(q.fromAddress)) throw new ValidationError("fromAddress is not a valid wallet address");
  if (q.toAddress && !ADDRESS_RE.test(q.toAddress)) throw new ValidationError("toAddress is not a valid wallet address");

  if (q.fromTokenAddress.toLowerCase() === q.toTokenAddress.toLowerCase() && fromChainId === toChainId) {
    throw new ValidationError("fromTokenAddress and toTokenAddress must be different");
  }

  // fromAmount must be a positive integer string (raw base units) — reject decimals,
  // negative numbers, scientific notation, and anything that isn't a clean bigint.
  if (!/^\d+$/.test(q.fromAmount)) throw new ValidationError("fromAmount must be a positive integer string (raw base units)");
  let fromAmountBig: bigint;
  try {
    fromAmountBig = BigInt(q.fromAmount);
  } catch {
    throw new ValidationError("fromAmount is not a valid integer");
  }
  if (fromAmountBig <= 0n) throw new ValidationError("fromAmount must be greater than 0");

  let slippageBps: number | undefined;
  if (q.slippageBps !== undefined) {
    slippageBps = Number(q.slippageBps);
    if (!Number.isFinite(slippageBps) || slippageBps < MIN_SLIPPAGE_BPS || slippageBps > MAX_SLIPPAGE_BPS) {
      throw new ValidationError(`slippageBps must be between ${MIN_SLIPPAGE_BPS} and ${MAX_SLIPPAGE_BPS}`);
    }
  }

  let fromTokenDecimals: number | undefined;
  if (q.fromTokenDecimals !== undefined) {
    fromTokenDecimals = Number(q.fromTokenDecimals);
    if (!Number.isInteger(fromTokenDecimals) || fromTokenDecimals < 0 || fromTokenDecimals > 36) {
      throw new ValidationError("fromTokenDecimals is out of range");
    }
  }

  const routeHint = q.routeHint as UnifiedQuoteRequest["routeHint"] | undefined;
  if (routeHint && !["doz", "aggregate", "bridge"].includes(routeHint)) {
    throw new ValidationError(`Unknown routeHint: ${routeHint}`);
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

function sendError(res: Response, err: unknown) {
  if (err instanceof SwapServiceError) {
    return res.status(toHttpStatus(err)).json({ success: false, code: err.code, message: err.message });
  }

  console.error("Unhandled swap error:", err);
  return res.status(500).json({ success: false, code: SwapErrorCode.UNKNOWN, message: "Something went wrong. Please try again." });
}

function isDozToken(chainId: number, address: string): boolean {
  return chainId === DOZ_AVAX_CHAIN_ID && address.toLowerCase() === DOZ_TOKEN_ADDRESS.toLowerCase();
}

/** Is this pair exactly the DOZ<->AVAX(native) pair on chain 43114? */
function isDozAvaxPair(req: UnifiedQuoteRequest): boolean {
  if (req.fromChainId !== DOZ_AVAX_CHAIN_ID || req.toChainId !== DOZ_AVAX_CHAIN_ID) return false;

  const from = req.fromTokenAddress.toLowerCase();
  const to = req.toTokenAddress.toLowerCase();
  const doz = DOZ_TOKEN_ADDRESS.toLowerCase();
  return (from === doz && to === NATIVE_ADDRESS) || (from === NATIVE_ADDRESS && to === doz);
}

/** Returns which side is DOZ if this request needs a two-leg DOZ route, else null. */
function needsDozComposite(parsed: UnifiedQuoteRequest): "from" | "to" | null {
  const fromIsDoz = isDozToken(parsed.fromChainId, parsed.fromTokenAddress);
  const toIsDoz = isDozToken(parsed.toChainId, parsed.toTokenAddress);

  if (fromIsDoz === toIsDoz) return null; // neither, or (impossible) both
  if (isDozAvaxPair(parsed)) return null; // same-chain DOZ<->AVAX — existing single-leg path
  return fromIsDoz ? "from" : "to";
}

async function quoteSameOrCrossChain(req: UnifiedQuoteRequest, feeBps: number) {
  if (req.fromChainId === req.toChainId) {
    try {
      return await getOpenOceanQuote(req, feeBps);
    } catch (ooErr) {
      try {
        return await getZeroExQuote(req, feeBps);
      } catch (zxErr) {
        throw pickMoreSpecificError(ooErr, zxErr);
      }
    }
  }
  try {
    return await getRelayQuote(req, feeBps);
  } catch (relayErr) {
    try {
      return await getMayanQuote(req, feeBps);
    } catch (mayanErr) {
      throw pickMoreSpecificError(relayErr, mayanErr);
    }
  }
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
  return quoteSameOrCrossChain(parsed, feeBps);
}

function buildCompositeQuote(leg1: any, leg2: any): any {
  return {
    route: "doz-composite",
    toolName: `${leg1.toolName} → ${leg2.toolName}`,
    isComposite: true,
    isCrossChain: leg1.isCrossChain || leg2.isCrossChain || leg1.fromToken.chainId !== leg2.toToken.chainId,
    legs: [leg1, leg2],
    fromToken: leg1.fromToken,
    toToken: leg2.toToken,
    fromAmount: leg1.fromAmount,
    toAmount: leg2.toAmount, // estimate — leg2 gets re-quoted for real before execution
    toAmountMin: leg2.toAmountMin,
    feeBps: leg1.feeBps + leg2.feeBps,
    feeAmount: leg1.feeAmount,
    feeToken: leg1.fromToken.address,
    executionDurationSeconds: (leg1.executionDurationSeconds ?? 0) + (leg2.executionDurationSeconds ?? 5),
    transactionRequest: leg1.transactionRequest, // leg1 is what actually gets signed first
    steps: leg1.steps,
    approval: leg1.approval,
  };
}

async function handleDozCompositeQuote(parsed: UnifiedQuoteRequest, dozSide: "from" | "to", feeBps: number, res: Response) {
  try {
    if (dozSide === "to") {
      // origin token -> native AVAX on the DOZ chain, then AVAX -> DOZ
      const leg1Req: UnifiedQuoteRequest = { ...parsed, toChainId: 43114, toTokenAddress: NATIVE_ADDRESS };
      const leg1 = await quoteSameOrCrossChain(leg1Req, feeBps);

      const built = await buildDozSwapTx({
        fromTokenAddress: NATIVE_ADDRESS,
        toTokenAddress: parsed.toTokenAddress,
        amountInRaw: leg1.toAmount, // estimate only — re-quoted for real client-side after leg1 lands
        slippageBps: parsed.slippageBps ?? 100,
        feeBps,
      });
      const leg2 = {
        route: "doz-amm",
        toolName: "DOZ/AVAX AMM",
        isCrossChain: false,
        fromToken: { address: NATIVE_ADDRESS, symbol: "AVAX", decimals: 18, chainId: DOZ_AVAX_CHAIN_ID },
        toToken: { address: parsed.toTokenAddress, symbol: "DOZ", decimals: 18, chainId: DOZ_AVAX_CHAIN_ID },
        fromAmount: leg1.toAmount,
        toAmount: built.amountOut,
        toAmountMin: built.amountOutMinimum,
        feeBps,
        feeAmount: built.feeAmount,
        executionDurationSeconds: 5,
        transactionRequest: { chainId: DOZ_AVAX_CHAIN_ID, to: built.to, data: built.data, value: built.value },
        approval: built.approval,
        dozAmmMeta: { zeroForOne: built.zeroForOne, sqrtPriceX96After: built.sqrtPriceX96After, partialFill: built.partialFill },
      };

      return res.json({ success: true, data: buildCompositeQuote(leg1, leg2) });
    } else {
      // DOZ -> native AVAX on the DOZ chain, then AVAX -> destination token
      const built = await buildDozSwapTx({
        fromTokenAddress: parsed.fromTokenAddress,
        toTokenAddress: NATIVE_ADDRESS,
        amountInRaw: parsed.fromAmount,
        slippageBps: parsed.slippageBps ?? 100,
        feeBps,
      });
      const leg1 = {
        route: "doz-amm",
        toolName: "DOZ/AVAX AMM",
        isCrossChain: false,
        fromToken: { address: parsed.fromTokenAddress, symbol: "DOZ", decimals: 18, chainId: DOZ_AVAX_CHAIN_ID },
        toToken: { address: NATIVE_ADDRESS, symbol: "AVAX", decimals: 18, chainId: DOZ_AVAX_CHAIN_ID },
        fromAmount: parsed.fromAmount,
        toAmount: built.amountOut,
        toAmountMin: built.amountOutMinimum,
        feeBps,
        feeAmount: built.feeAmount,
        executionDurationSeconds: 5,
        transactionRequest: { chainId: DOZ_AVAX_CHAIN_ID, to: built.to, data: built.data, value: built.value },
        approval: built.approval,
        dozAmmMeta: { zeroForOne: built.zeroForOne, sqrtPriceX96After: built.sqrtPriceX96After, partialFill: built.partialFill },
      };

      const leg2Req: UnifiedQuoteRequest = { ...parsed, fromChainId: 43114, fromTokenAddress: NATIVE_ADDRESS, fromAmount: built.amountOut };
      const leg2 = await quoteSameOrCrossChain(leg2Req, feeBps);

      return res.json({ success: true, data: buildCompositeQuote(leg1, leg2) });
    }
  } catch (e) {
    return sendError(res, e);
  }
}

export async function getSwapQuote(req: Request, res: Response) {
  let parsed: UnifiedQuoteRequest;

  try {
    parsed = parseRequest(req);
  } catch (e) {
    return sendError(res, e);
  }

  let FEE_BPS = 250;
  const userFeeDetails = await SubscriptionModel.findOne({ address: req?.user?.address });
  const subscriptionMOdel = await Pricing.findOne({ mode: PricingMode.NFT, pkgId: userFeeDetails?.packages?.nft?.pkgId ?? 0 });
  if (subscriptionMOdel && subscriptionMOdel.fee && Number(subscriptionMOdel.fee)) FEE_BPS = subscriptionMOdel.fee;

  const dozSide = needsDozComposite(parsed);
  if (dozSide) {
    return handleDozCompositeQuote(parsed, dozSide, FEE_BPS, res);
  }

  if (isDozAvaxPair(parsed)) {
    try {
      const data = await handleSingleDozOrRoute(parsed, FEE_BPS);
      return res.json({ success: true, data });
    } catch (e) {
      return sendError(res, e);
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

    if (hint === "aggregate") {
      if (parsed.fromChainId !== parsed.toChainId) {
        return res.status(400).json({ success: false, code: SwapErrorCode.INVALID_PARAMS, message: "routeHint=aggregate only supports same-chain swaps" });
      }
      try {
        const quote = await getOpenOceanQuote(parsed, FEE_BPS);
        return res.json({ success: true, data: quote });
      } catch (ooErr) {
        try {
          const quote = await getZeroExQuote(parsed, FEE_BPS);
          return res.json({ success: true, data: quote, fallbackReason: (ooErr as Error).message });
        } catch (zxErr) {
          return sendError(res, pickMoreSpecificError(ooErr, zxErr));
        }
      }
    }

    // hint === "bridge"
    if (parsed.fromChainId === parsed.toChainId) {
      return res.status(400).json({ success: false, code: SwapErrorCode.INVALID_PARAMS, message: "routeHint=bridge requires fromChainId !== toChainId" });
    }
    try {
      const quote = await getRelayQuote(parsed, FEE_BPS);
      return res.json({ success: true, data: quote });
    } catch (relayErr) {
      try {
        const quote = await getMayanQuote(parsed, FEE_BPS);
        return res.json({ success: true, data: quote, fallbackReason: (relayErr as Error).message });
      } catch (mayanErr) {
        return sendError(res, pickMoreSpecificError(relayErr, mayanErr));
      }
    }
  } catch (e) {
    return sendError(res, e);
  }
}

const SPECIFIC_CODES = new Set([SwapErrorCode.AMOUNT_TOO_LOW, SwapErrorCode.AMOUNT_TOO_HIGH, SwapErrorCode.INSUFFICIENT_BALANCE, SwapErrorCode.RATE_LIMITED, SwapErrorCode.SLIPPAGE_TOO_LOW]);
function pickMoreSpecificError(first: unknown, second: unknown): unknown {
  const firstSpecific = first instanceof SwapServiceError && SPECIFIC_CODES.has(first.code);
  const secondSpecific = second instanceof SwapServiceError && SPECIFIC_CODES.has(second.code);
  return secondSpecific && !firstSpecific ? second : first;
}

/**
 * GET/POST /swap/quote/leg
 */
export async function getDozLegQuote(req: Request, res: Response) {
  let parsed: UnifiedQuoteRequest;
  try {
    parsed = parseRequest(req);
  } catch (e) {
    return sendError(res, e);
  }
  const feeBps = 250; // resolve via subscription lookup too if you want it to match getSwapQuote exactly
  try {
    const quote = await handleSingleDozOrRoute(parsed, feeBps);
    return res.json({ success: true, data: quote });
  } catch (e) {
    return sendError(res, e);
  }
}
