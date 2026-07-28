// src/services/mayan.service.ts

import { fetchQuote, getSwapFromEvmTxPayload, type Quote } from "@mayanfinance/swap-sdk";
import { MAYAN_CHAIN_NAME, MAYAN_REFERRER_BPS, MAYAN_TIMEOUT_MS, NATIVE_ADDRESS, TREASURY_ADDRESS } from "../config/swap.config";
import { UnifiedQuote, UnifiedQuoteRequest } from "../types";
import { SwapErrorCode, SwapServiceError, classifyUpstreamError, withTimeout } from "../utils/swapErrors";

export class MayanError extends SwapServiceError {
  constructor(message: string, code: SwapErrorCode = SwapErrorCode.UNKNOWN) {
    super(code, message);
    this.name = "MayanError";
  }
}

function toMayanTokenAddress(address: string): string {
  return address.toLowerCase() === NATIVE_ADDRESS ? NATIVE_ADDRESS : address;
}

export async function getMayanQuote(req: UnifiedQuoteRequest, feeBps: number): Promise<UnifiedQuote> {
  if (req.fromChainId === req.toChainId) throw new MayanError("Mayan route is for cross-chain swaps only", SwapErrorCode.INVALID_PARAMS);
  const fromChain = MAYAN_CHAIN_NAME[req.fromChainId];
  const toChain = MAYAN_CHAIN_NAME[req.toChainId];
  if (!fromChain || !toChain) throw new MayanError(`Mayan does not cover chainId ${req.fromChainId} -> ${req.toChainId}`, SwapErrorCode.UNSUPPORTED_CHAIN);

  let fromAmountRaw: bigint;
  try {
    fromAmountRaw = BigInt(req.fromAmount);
  } catch {
    throw new MayanError("Invalid swap amount", SwapErrorCode.INVALID_PARAMS);
  }
  if (fromAmountRaw <= 0n) throw new MayanError("Enter an amount greater than 0", SwapErrorCode.AMOUNT_TOO_LOW);

  const decimals = req.fromTokenDecimals ?? 18;
  const humanAmount = Number(fromAmountRaw) / 10 ** decimals;
  if (!Number.isFinite(humanAmount) || humanAmount <= 0) {
    throw new MayanError("Enter an amount greater than 0", SwapErrorCode.AMOUNT_TOO_LOW);
  }

  let quotes: Quote[];
  try {
    quotes = await withTimeout(
      fetchQuote({
        amount: humanAmount,
        fromToken: toMayanTokenAddress(req.fromTokenAddress),
        toToken: toMayanTokenAddress(req.toTokenAddress),
        fromChain: fromChain as never,
        toChain: toChain as never,
        slippageBps: req.slippageBps ?? "auto",
        referrer: TREASURY_ADDRESS,
        referrerBps: feeBps > 0 ? MAYAN_REFERRER_BPS : undefined,
      }),
      MAYAN_TIMEOUT_MS,
    );
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      throw new MayanError("The price provider took too long to respond. Please try again.", SwapErrorCode.TIMEOUT);
    }
    const { code, message } = classifyUpstreamError({ httpStatus: err?.response?.status, rawMessage: err?.message });
    throw new MayanError(message, code);
  }

  if (!quotes.length) throw new MayanError("No cross-chain route found for this pair. Try a different token or amount.", SwapErrorCode.NO_ROUTE);
  const best = quotes[0];

  let payload;
  try {
    payload = await withTimeout(
      getSwapFromEvmTxPayload(
        best,
        req.fromAddress,
        req.toAddress || req.fromAddress,
        { evm: TREASURY_ADDRESS },
        req.fromAddress,
        req.fromChainId,
        null, // permit — omit unless the input token supports EIP-2612 and you've collected a signature
        undefined,
        undefined,
      ),
      MAYAN_TIMEOUT_MS,
    );
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      throw new MayanError("Timed out preparing the transaction. Please try again.", SwapErrorCode.TIMEOUT);
    }
    throw new MayanError(err?.message || "Failed to prepare Mayan transaction", SwapErrorCode.UNKNOWN);
  }
  const forwarderTo: string = String(payload?.to);
  const forwarderData: string = String(payload?.data);
  const forwarderValue: string = payload?.value?.toString?.() ?? "0";

  const isNativeIn = req.fromTokenAddress.toLowerCase() === NATIVE_ADDRESS;

  return {
    route: "mayan",
    toolName: "Mayan",
    isCrossChain: true,
    fromToken: { address: req.fromTokenAddress, symbol: best.fromToken.symbol, decimals: best.fromToken.decimals, chainId: req.fromChainId },
    toToken: { address: req.toTokenAddress, symbol: best.toToken.symbol, decimals: best.toToken.decimals, chainId: req.toChainId },
    fromAmount: req.fromAmount,
    toAmount: String(Math.round(best.expectedAmountOut * 10 ** best.toToken.decimals)),
    toAmountMin: String(Math.round(best.minAmountOut * 10 ** best.toToken.decimals)),
    feeBps,
    feeAmount: "0", // Mayan's referrer fee is netted into the route pricing itself, not a separate transfer
    feeToken: req.fromTokenAddress,
    executionDurationSeconds: 180, // cross-chain message passing (Wormhole) — a few minutes typical
    transactionRequest: { chainId: req.fromChainId, to: forwarderTo, data: forwarderData, value: forwarderValue },
    approval: isNativeIn ? null : { token: req.fromTokenAddress, spender: forwarderTo, amount: req.fromAmount },
  };
}
