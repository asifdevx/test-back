//backend -->  Dozamm.service.ts
import { ethers } from "ethers";

import { CHAINS } from "../config/contract";
import { DOZ_AMM_DEADLINE_MINUTES, DOZ_RPC_TIMEOUT_MS, NATIVE_ADDRESS } from "../config/swap.config";
import { POOL_ABI, ROUTER_ABI } from "../constant/abi";
import env from "../constant/env";
import { getDozSwapRestrictionMode, } from "../mongoDb/controllers/c.admin-poolAdmin";
import { DozSwapDirectionLock } from "../mongoDb/schemas/sch.dozswaprestriction";
import { SwapErrorCode, SwapServiceError, withTimeout } from "../utils/swapErrors";


const replaceWssToHttps = (rpc: string) => rpc.replace("wss", "https");

export const getRpcForPool: string = replaceWssToHttps(env.node_env === "test" ? "wss://eth-hoodi.g.alchemy.com/v2/e1DbDpM-e6e_d6qf-nDs2" : CHAINS.AVALANCHE.rpc);

export const provider = new ethers.JsonRpcProvider(getRpcForPool);
export const router = new ethers.Contract(env.ROUTER_ADDRESS, ROUTER_ABI, provider);
export const pool = new ethers.Contract(env.POOL_ADDRESS, POOL_ABI || POOL_ABI, provider);

function createDozAmmError(message: string, code: SwapErrorCode = SwapErrorCode.UNKNOWN): SwapServiceError {
  const error = new SwapServiceError(code, message);
  error.name = "DozAmmError";
  return error;
}



function classifyChainError(err: any): SwapServiceError {
  if (err?.name === "TimeoutError") {
    return createDozAmmError("The Avalanche RPC took too long to respond. Please try again.", SwapErrorCode.TIMEOUT);
  }
  const reason: string | undefined = err?.reason || err?.shortMessage || err?.error?.message;
  if (reason && /below.*min|amount.*(too small|zero)/i.test(reason)) {
    return createDozAmmError("This amount is too small to swap. Try a larger amount.", SwapErrorCode.AMOUNT_TOO_LOW);
  }
  if (reason && /price.*limit|liquidity|slippage/i.test(reason)) {
    return createDozAmmError("This amount exceeds available pool liquidity. Try a smaller amount.", SwapErrorCode.AMOUNT_TOO_HIGH);
  }
  if (err?.code === "NETWORK_ERROR" || err?.code === "SERVER_ERROR" || err?.code === "TIMEOUT") {
    return createDozAmmError("Could not reach the Avalanche network. Please try again.", SwapErrorCode.UPSTREAM_UNAVAILABLE);
  }
  if (err?.code === "CALL_EXCEPTION") {
    return createDozAmmError(reason ? `Pool rejected the swap: ${reason}` : "The pool rejected this swap.", SwapErrorCode.NO_ROUTE);
  }
  return createDozAmmError(reason || err?.message || "Failed to quote DOZ/AVAX swap", SwapErrorCode.UNKNOWN);
}

interface PoolTokens {
  token0: string;
  token1: string;
  wavax: string;
}


function isDozDirectionBlocked(mode: DozSwapDirectionLock, isFromNative: boolean): boolean {
  if (mode === DozSwapDirectionLock.DISABLE_ALL) return true;
  if (mode === DozSwapDirectionLock.DISABLE_FROM_AVAX && isFromNative) return true;
  if (mode === DozSwapDirectionLock.DISABLE_FROM_DOZ && !isFromNative) return true;
  return false;
}


let cachedPoolTokens: PoolTokens | null = null;
let cachedSqrtLimits: { min: bigint; max: bigint } | null = null;

async function getPoolTokens(): Promise<PoolTokens> {
  if (cachedPoolTokens) return cachedPoolTokens;

  try {
    const [token0, token1, wavax] = await withTimeout(Promise.all([router.token0(), router.token1(), router.wavax()]), DOZ_RPC_TIMEOUT_MS);
    cachedPoolTokens = { token0: token0.toLowerCase(), token1: token1.toLowerCase(), wavax: (wavax as string).toLowerCase() };
    return cachedPoolTokens;
  } catch (err) {
    throw classifyChainError(err);
  }
}

async function getSqrtRatioLimits(): Promise<{ min: bigint; max: bigint }> {
  if (cachedSqrtLimits) return cachedSqrtLimits;
  try {
    const [minTick, maxTick] = await withTimeout(Promise.all([pool.minTick(), pool.maxTick()]), DOZ_RPC_TIMEOUT_MS);
    const [minRatio, maxRatio]: [bigint, bigint] = await withTimeout(Promise.all([pool.tickToPrice(minTick), pool.tickToPrice(maxTick)]), DOZ_RPC_TIMEOUT_MS);

    cachedSqrtLimits = { min: minRatio + 1n, max: maxRatio - 1n };
    return cachedSqrtLimits;
  } catch (err) {
    throw classifyChainError(err);
  }
}
function resolveZeroForOne(fromAddress: string, tokens: PoolTokens): boolean {
  const from = fromAddress.toLowerCase() === NATIVE_ADDRESS ? tokens.wavax : fromAddress.toLowerCase();
  if (from === tokens.token0) return true;
  if (from === tokens.token1) return false;
  throw createDozAmmError("Token is not part of the DOZ/AVAX pool", SwapErrorCode.UNSUPPORTED_PAIR);
}

export interface DozQuoteParams {
  fromTokenAddress: string;
  toTokenAddress: string;
  amountInRaw: string;
  slippageBps: number;
  feeBps:number;
}

export interface DozQuoteResult {
  zeroForOne: boolean;
  feeBps: number;
  feeAmount: string;
  swapAmountIn: string;
  amountOut: string;
  amountOutMinimum: string;
  sqrtPriceX96After: string;
  partialFill: boolean;
  isFromNative: boolean;
  isToNative: boolean;
}

export async function getDozQuote(params: DozQuoteParams): Promise<DozQuoteResult> {
  const feeBps= params?.feeBps;
  let totalAmountIn: bigint;
  try {
    totalAmountIn = BigInt(params.amountInRaw);
  } catch {
    throw createDozAmmError("Invalid swap amount", SwapErrorCode.INVALID_PARAMS);
  }
  if (totalAmountIn <= 0n) throw createDozAmmError("Enter an amount greater than 0", SwapErrorCode.AMOUNT_TOO_LOW);

    const isFromNative = params.fromTokenAddress.toLowerCase() === NATIVE_ADDRESS;
    const restrictionMode = await getDozSwapRestrictionMode();
    if (isDozDirectionBlocked(restrictionMode, isFromNative)) {
      const message =
        restrictionMode === "disable-all"
          ? "DOZ/AVAX swaps are temporarily disabled."
          : isFromNative
            ? "Swapping AVAX into DOZ is temporarily disabled."
            : "Swapping DOZ into AVAX is temporarily disabled.";
       throw createDozAmmError(message, (SwapErrorCode as any).ROUTE_DISABLED ?? SwapErrorCode.UNSUPPORTED_PAIR);
    }

  const tokens = await getPoolTokens();
  const zeroForOne = resolveZeroForOne(params.fromTokenAddress, tokens);
  const limits = await getSqrtRatioLimits();

  
  const sqrtPriceLimitX96 = zeroForOne ? limits.min : limits.max;

  let feeAmount: bigint, swapAmountIn: bigint, amountOut: bigint, sqrtPriceX96After: bigint, partialFill: boolean;
  try {
    [feeAmount, swapAmountIn, amountOut, sqrtPriceX96After, partialFill] = await withTimeout(
      router.previewSwapExactInputWithFee(zeroForOne, totalAmountIn, sqrtPriceLimitX96, feeBps),
      DOZ_RPC_TIMEOUT_MS,
    );
  } catch (err) {
    throw classifyChainError(err);
  }
  if (amountOut <= 0n) {
    throw createDozAmmError("This amount is too small to swap. Try a larger amount.", SwapErrorCode.AMOUNT_TOO_LOW);
  }

  const slippageBps = BigInt(Math.max(0, Math.floor(params.slippageBps)));
  const amountOutMinimum = amountOut - (amountOut * slippageBps) / 10000n;

  return {
    zeroForOne,
    feeBps,
    feeAmount: feeAmount.toString(),
    swapAmountIn: swapAmountIn.toString(),
    amountOut: amountOut.toString(),
    amountOutMinimum: (amountOutMinimum < 0n ? 0n : amountOutMinimum).toString(),
    sqrtPriceX96After: sqrtPriceX96After.toString(),
    partialFill,
    isFromNative: params.fromTokenAddress.toLowerCase() === NATIVE_ADDRESS,
    isToNative: params.toTokenAddress.toLowerCase() === NATIVE_ADDRESS,
  };
}

export interface DozBuildTxParams extends DozQuoteParams {
  deadlineMinutes?: number;
}

export interface DozBuildTxResult extends DozQuoteResult {
  to: string;
  data: string;
  value: string; 
  deadline: string;
  functionName: "swapWithTokens" | "swapNativeIn" | "swapForNativeOut";
 
  approval: { token: string; spender: string; amount: string } | null;
}

export async function buildDozSwapTx(params: DozBuildTxParams): Promise<DozBuildTxResult> {
  const quote = await getDozQuote(params);

  const limits = await getSqrtRatioLimits();

  const sqrtPriceLimitX96 = quote.zeroForOne ? limits.min : limits.max;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineMinutes ?? DOZ_AMM_DEADLINE_MINUTES) * 60);
  const totalAmountIn = BigInt(params.amountInRaw);

  let data: string;
  let value = "0";
  let functionName: DozBuildTxResult["functionName"];
  let approval: DozBuildTxResult["approval"] = null;

  try {
    if (quote.isFromNative) {
      functionName = "swapNativeIn";
      data = router.interface.encodeFunctionData("swapNativeIn", [quote.zeroForOne, sqrtPriceLimitX96, quote.feeBps, quote.amountOutMinimum, deadline]);
      value = totalAmountIn.toString(); // fee is skimmed from msg.value on-chain
    } else if (quote.isToNative) {
      functionName = "swapForNativeOut";
      data = router.interface.encodeFunctionData("swapForNativeOut", [quote.zeroForOne, totalAmountIn, sqrtPriceLimitX96, quote.feeBps, quote.amountOutMinimum, deadline]);
      approval = { token: params.fromTokenAddress, spender: env.ROUTER_ADDRESS, amount: totalAmountIn.toString() };
    } else {
      functionName = "swapWithTokens";
      data = router.interface.encodeFunctionData("swapWithTokens", [quote.zeroForOne, totalAmountIn, sqrtPriceLimitX96, quote.feeBps, quote.amountOutMinimum, deadline]);
      approval = { token: params.fromTokenAddress, spender: env.ROUTER_ADDRESS, amount: totalAmountIn.toString() };
    }
  } catch (err) {
    console.error("DOZ AMM calldata encoding failed:", err);
    throw createDozAmmError("Failed to prepare the swap transaction. Please try again.", SwapErrorCode.UNKNOWN);
  }

  return {
    ...quote,
    to: env.ROUTER_ADDRESS,
    data,
    value,
    deadline: deadline.toString(),
    functionName,
    approval,
  };
}