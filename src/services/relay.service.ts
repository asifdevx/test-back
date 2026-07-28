

import { NATIVE_ADDRESS, RELAY_API_KEY, RELAY_BASE_URL, RELAY_REQUEST_TIMEOUT_MS, TREASURY_ADDRESS } from "../config/swap.config";
import { UnifiedQuote, UnifiedQuoteRequest, UnifiedTransactionRequest } from "../types";
import { SwapErrorCode, SwapServiceError, classifyUpstreamError } from "../utils/swapErrors";

export class RelayError extends SwapServiceError {
  constructor(message: string, code: SwapErrorCode = SwapErrorCode.UNKNOWN) {
    super(code, message);
    this.name = "RelayError";
  }
}
interface RelayQuoteResponse {
  steps: Array<{
    id: string;
    kind: string; // "transaction" | "signature"
    items: Array<{
      data: {
        to: string;
        data: string;
        value: string;
        chainId: number;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
        gas?: string;
      };
      check?: { endpoint: string; method: string };
    }>;
  }>;
  fees?: {
    gas?: { amount: string };
    relayerService?: { amount: string };
    relayerGas?: { amount: string };
    app?: { amount: string };
  };
  details?: {
    currencyIn?: { amount: string; currency: { symbol: string; decimals: number; address: string } };
    currencyOut?: { amount: string; amountMin?: string; currency: { symbol: string; decimals: number; address: string } };
    timeEstimate?: number; // seconds
  };
}

export async function getRelayQuote(req: UnifiedQuoteRequest, feeBps: number): Promise<UnifiedQuote> {
  if (req.fromChainId === req.toChainId) throw new RelayError("Relay route is for cross-chain swaps only", SwapErrorCode.INVALID_PARAMS);

  let amt: bigint;
  try {
    amt = BigInt(req.fromAmount);
  } catch {
    throw new RelayError("Invalid swap amount", SwapErrorCode.INVALID_PARAMS);
  }
  if (amt <= 0n) throw new RelayError("Enter an amount greater than 0", SwapErrorCode.AMOUNT_TOO_LOW);

  const body: Record<string, unknown> = {
    user: req.fromAddress,
    recipient: req.toAddress || req.fromAddress,
    originChainId: req.fromChainId,
    destinationChainId: req.toChainId,
    originCurrency: req.fromTokenAddress.toLowerCase() === NATIVE_ADDRESS ? NATIVE_ADDRESS : req.fromTokenAddress,
    destinationCurrency: req.toTokenAddress.toLowerCase() === NATIVE_ADDRESS ? NATIVE_ADDRESS : req.toTokenAddress,
    amount: req.fromAmount,
    tradeType: "EXACT_INPUT",
  };

  if (feeBps > 0) {
    body.appFees = [{ recipient: TREASURY_ADDRESS, fee: String(feeBps) }];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RELAY_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${RELAY_BASE_URL}/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(RELAY_API_KEY ? { "x-api-key": RELAY_API_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    const timedOut = err?.name === "AbortError";
    const { code, message } = classifyUpstreamError({ timedOut, rawMessage: err?.message });
    throw new RelayError(message, code);
  } finally {
    clearTimeout(timeoutId);
  }

  const json = (await res.json()) as RelayQuoteResponse & { message?: string };

  if (!res.ok) {
    const { code, message } = classifyUpstreamError({ httpStatus: res.status, rawMessage: json.message || `Relay quote failed (HTTP ${res.status})` });
    throw new RelayError(message, code);
  }
  if (!json.steps?.length) throw new RelayError("No cross-chain route found for this pair. Try a different token or amount.", SwapErrorCode.NO_ROUTE);

  const txSteps: UnifiedTransactionRequest[] = [];
  let statusCheck: UnifiedQuote["statusCheck"];
  for (const step of json.steps) {
    if (step.kind !== "transaction") continue; // skip pure-signature steps; not needed for a standard EOA swap
    for (const item of step.items) {
      txSteps.push({
        chainId: item.data.chainId,
        to: item.data.to,
        data: item.data.data,
        value: item.data.value ?? "0",
        maxFeePerGas: item.data.maxFeePerGas,
        maxPriorityFeePerGas: item.data.maxPriorityFeePerGas,
        gasLimit: item.data.gas,
      });
      if (item.check && !statusCheck) {
        statusCheck = { url: item.check.endpoint, method: item.check.method === "POST" ? "POST" : "GET" };
      }
    }
  }
  if (!txSteps.length) throw new RelayError("Relay route had no on-chain transaction steps", SwapErrorCode.NO_ROUTE);

  const feeAmount = json.fees?.app?.amount ?? "0";
  const currencyIn = json.details?.currencyIn;
  const currencyOut = json.details?.currencyOut;

  if (!currencyOut?.amount || BigInt(currencyOut.amount) <= 0n) {
    throw new RelayError("This amount is too small to swap. Try a larger amount.", SwapErrorCode.AMOUNT_TOO_LOW);
  }

  return {
    route: "relay",
    toolName: "Relay",
    isCrossChain: true,
    fromToken: {
      address: currencyIn?.currency.address ?? req.fromTokenAddress,
      symbol: currencyIn?.currency.symbol ?? "",
      decimals: currencyIn?.currency.decimals ?? 18,
      chainId: req.fromChainId,
    },
    toToken: {
      address: currencyOut?.currency.address ?? req.toTokenAddress,
      symbol: currencyOut?.currency.symbol ?? "",
      decimals: currencyOut?.currency.decimals ?? 18,
      chainId: req.toChainId,
    },
    fromAmount: currencyIn?.amount ?? req.fromAmount,
    toAmount: currencyOut?.amount ?? "0",
    toAmountMin: currencyOut?.amountMin ?? currencyOut?.amount ?? "0",
    feeBps,
    feeAmount,
    feeToken: TREASURY_ADDRESS, // Relay app fees are collected off-chain per docs — claimed later, not sent inline
    executionDurationSeconds: json.details?.timeEstimate ?? 30,

    approval: null,
    steps: txSteps,
    transactionRequest: txSteps[txSteps.length - 1],
    statusCheck,
  };
}