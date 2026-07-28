

import { NATIVE_ADDRESS, TREASURY_ADDRESS, ZEROEX_API_KEY, ZEROEX_BASE_URL, ZEROEX_NATIVE_PLACEHOLDER, ZEROEX_REQUEST_TIMEOUT_MS, ZEROEX_SUPPORTED_CHAINS } from "../config/swap.config";
import { UnifiedQuote, UnifiedQuoteRequest } from "../types";
import { classifyUpstreamError, SwapErrorCode, SwapServiceError } from "../utils/swapErrors";

export class ZeroExError extends SwapServiceError {
  constructor(message: string, code: SwapErrorCode = SwapErrorCode.UNKNOWN) {
    super(code, message);
    this.name = "ZeroExError";
  }
}
// 0x uses the same "all-Es" placeholder as OpenOcean for native tokens.

function toZeroExAddress(address: string): string {
  return address.toLowerCase() === NATIVE_ADDRESS ? ZEROEX_NATIVE_PLACEHOLDER : address;
}

interface ZeroExQuoteResponse {
  buyAmount: string;
  buyToken: string;
  sellAmount: string;
  sellToken: string;
  minBuyAmount: string;
  gas?: string;
  transaction: { to: string; data: string; value: string; gas?: string; gasPrice?: string };
  issues?: { allowance?: { spender: string } | null };
  fees?: { integratorFee?: { amount: string; token: string } | null };
}

export async function getZeroExQuote(req: UnifiedQuoteRequest, feeBps: number): Promise<UnifiedQuote> {
  if (!ZEROEX_API_KEY) throw new ZeroExError("0x route is not configured (missing ZEROEX_API_KEY)", SwapErrorCode.MISCONFIGURED);
  if (req.fromChainId !== req.toChainId) throw new ZeroExError("0x route only supports same-chain swaps", SwapErrorCode.INVALID_PARAMS);
  if (!ZEROEX_SUPPORTED_CHAINS.has(req.fromChainId)) throw new ZeroExError(`0x does not cover chainId ${req.fromChainId}`, SwapErrorCode.UNSUPPORTED_CHAIN);
  if (req.fromTokenAddress.toLowerCase() === req.toTokenAddress.toLowerCase()) {
    throw new ZeroExError("Choose two different tokens", SwapErrorCode.INVALID_PARAMS);
  }
  let amt: bigint;
  try {
    amt = BigInt(req.fromAmount);
  } catch {
    throw new ZeroExError("Invalid swap amount", SwapErrorCode.INVALID_PARAMS);
  }
  if (amt <= 0n) throw new ZeroExError("Enter an amount greater than 0", SwapErrorCode.AMOUNT_TOO_LOW);

  const isNativeIn = req.fromTokenAddress.toLowerCase() === NATIVE_ADDRESS;
  const slippageBps = req.slippageBps ?? 100;

  const params = new URLSearchParams({
    chainId: String(req.fromChainId),
    sellToken: toZeroExAddress(req.fromTokenAddress),
    buyToken: toZeroExAddress(req.toTokenAddress),
    sellAmount: req.fromAmount,
    taker: req.fromAddress,
    slippageBps: String(slippageBps),
  });

  if (feeBps > 0) {
    params.set("swapFeeBps", String(feeBps));
    params.set("swapFeeRecipient", TREASURY_ADDRESS);
    // Fee must be denominated in either buyToken or sellToken — sellToken keeps this
    // predictable regardless of what's being bought.
    params.set("swapFeeToken", toZeroExAddress(req.fromTokenAddress));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ZEROEX_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${ZEROEX_BASE_URL}/swap/allowance-holder/quote?${params.toString()}`, {
      headers: { "0x-api-key": ZEROEX_API_KEY, "0x-version": "v2" },
      signal: controller.signal,
    });
  } catch (err: any) {
    const timedOut = err?.name === "AbortError";
    const { code, message } = classifyUpstreamError({ timedOut, rawMessage: err?.message });
    throw new ZeroExError(message, code);
  } finally {
    clearTimeout(timeoutId);
  }

  const json = (await res.json()) as ZeroExQuoteResponse & { reason?: string; validationErrors?: unknown };

  if (!res.ok) {
    const rawMessage = json.reason || `0x quote failed (HTTP ${res.status})`;
    const { code, message } = classifyUpstreamError({ httpStatus: res.status, rawMessage });
    throw new ZeroExError(message, code);
  }

  if (!json.buyAmount || BigInt(json.buyAmount) <= 0n) {
    throw new ZeroExError("This amount is too small to swap. Try a larger amount.", SwapErrorCode.AMOUNT_TOO_LOW);
  }

  const feeAmount = json.fees?.integratorFee?.amount ?? "0";
  const spender = json.issues?.allowance?.spender;

  return {
    route: "0x",
    toolName: "0x",
    isCrossChain: false,
    fromToken: { address: req.fromTokenAddress, symbol: "", decimals: 0, chainId: req.fromChainId },
    toToken: { address: req.toTokenAddress, symbol: "", decimals: 0, chainId: req.toChainId },
    fromAmount: json.sellAmount,
    toAmount: json.buyAmount,
    toAmountMin: json.minBuyAmount,
    feeBps,
    feeAmount,
    feeToken: req.fromTokenAddress,
    estimatedGas: json.transaction.gas,
    executionDurationSeconds: 15,
    transactionRequest: {
      chainId: req.fromChainId,
      to: json.transaction.to,
      data: json.transaction.data,
      value: json.transaction.value ?? "0",
      gasPrice: json.transaction.gasPrice,
    },
    approval: isNativeIn || !spender ? null : { token: req.fromTokenAddress, spender, amount: json.sellAmount },
  };
}