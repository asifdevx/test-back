// src/services/openocean.service.ts

import axios from "axios";
import { NATIVE_ADDRESS, OPEN_OCEAN_REQUEST_TIMEOUT_MS, OPENOCEAN_BASE_URL, OPENOCEAN_CHAIN_SLUG, OPENOCEAN_NATIVE_PLACEHOLDER, TREASURY_ADDRESS } from "../config/swap.config";
import { UnifiedQuote, UnifiedQuoteRequest } from "../types";
import { classifyUpstreamError, SwapErrorCode, SwapServiceError } from "../utils/swapErrors";

export class OpenOceanError extends SwapServiceError {
  constructor(message: string, code: SwapErrorCode = SwapErrorCode.UNKNOWN) {
    super(code, message);
    this.name = "OpenOceanError";
  }
}

function toOpenOceanAddress(address: string): string {
  return address.toLowerCase() === NATIVE_ADDRESS ? OPENOCEAN_NATIVE_PLACEHOLDER : address;
}
async function getGasPrice(chainId: number): Promise<string> {
  try {
    const { data } = await axios.get(`${OPENOCEAN_BASE_URL}/${chainId}/gasPrice`, { timeout: OPEN_OCEAN_REQUEST_TIMEOUT_MS });

    if (data.code === 200 && data.data) {
      return String(data.data.standard?.legacyGasPrice ?? data.data.fast?.legacyGasPrice ?? data.data.instant?.legacyGasPrice ?? data.data.base ?? "10");
    }
  } catch (e) {
    console.error("OpenOcean gasPrice fetch failed, using fallback:", (e as Error)?.message);
  }

  return "10";
}

/** Guards against 0, negative, or non-numeric amounts before we ever call out to OpenOcean. */
function assertValidAmount(fromAmount: string) {
  let amt: bigint;
  try {
    amt = BigInt(fromAmount);
  } catch {
    throw new OpenOceanError("Invalid swap amount", SwapErrorCode.INVALID_PARAMS);
  }
  if (amt <= 0n) throw new OpenOceanError("Enter an amount greater than 0", SwapErrorCode.AMOUNT_TOO_LOW);
}

export async function getOpenOceanQuote(req: UnifiedQuoteRequest, feeBps: number): Promise<UnifiedQuote> {
  const chainSlug = OPENOCEAN_CHAIN_SLUG[req.fromChainId];
  if (!chainSlug) throw new OpenOceanError(`OpenOcean does not support chainId ${req.fromChainId}`, SwapErrorCode.UNSUPPORTED_CHAIN);
  if (req.fromChainId !== req.toChainId) throw new OpenOceanError("OpenOcean route only supports same-chain swaps", SwapErrorCode.INVALID_PARAMS);
  if (req.fromTokenAddress.toLowerCase() === req.toTokenAddress.toLowerCase()) {
    throw new OpenOceanError("Choose two different tokens", SwapErrorCode.INVALID_PARAMS);
  }
  assertValidAmount(req.fromAmount);

  const slippagePct = Math.max(0.05, (req.slippageBps ?? 100) / 100); // OpenOcean wants a percentage, min 0.05
  const referrerFeePct = (feeBps / 10000) * 100; 
  const gasPrice = await getGasPrice(req.fromChainId);

  const params = new URLSearchParams({
    inTokenAddress: toOpenOceanAddress(req.fromTokenAddress),
    outTokenAddress: toOpenOceanAddress(req.toTokenAddress),
    amountDecimals: req.fromAmount, // already raw base-unit wei string
    gasPriceDecimals: gasPrice, // let OpenOcean pick current network gas price
    slippage: String(slippagePct),
    account: req.fromAddress,
    referrer: TREASURY_ADDRESS,
    referrerFee: referrerFeePct > 0 ? String(referrerFeePct) : "0",
  });

  const url = `${OPENOCEAN_BASE_URL}/${req.fromChainId}/swap`;
  try {
    const { data } = await axios.get(url, { params, timeout: OPEN_OCEAN_REQUEST_TIMEOUT_MS });

    if (data.code !== 200 || !data.data) {
      const rawMessage = data.errorMsg || data.error || "OpenOcean quote failed";
      const { code, message } = classifyUpstreamError({ rawMessage });
      throw new OpenOceanError(message, code);
    }

    const d = data?.data;

    if (!d.outAmount || BigInt(d.outAmount) <= 0n) {
      throw new OpenOceanError("This amount is too small to swap. Try a larger amount.", SwapErrorCode.AMOUNT_TOO_LOW);
    }

    return {
      route: "openocean",
      toolName: "OpenOcean",
      isCrossChain: false,

      fromToken: { ...d.inToken, chainId: req.fromChainId },
      toToken: { ...d.outToken, chainId: req.toChainId },

      fromAmount: d.inAmount,
      toAmount: d.outAmount,
      toAmountMin: d.minOutAmount ?? d.outAmount,

      feeBps,
      feeAmount: ((BigInt(d.inAmount) * BigInt(feeBps)) / 10000n).toString(),

      feeToken: d.inToken.address,
      estimatedGas: d.estimatedGas,
      executionDurationSeconds: 15,

      transactionRequest: {
        chainId: req.fromChainId,
        to: d.to,
        data: d.data,
        value: d.value ?? "0",
      },

      approval:
        req.fromTokenAddress.toLowerCase() === NATIVE_ADDRESS
          ? null
          : {
              token: req.fromTokenAddress,
              spender: d.to,
              amount: d.inAmount,
            },
    };
  } catch (err: any) {
    if (err instanceof OpenOceanError) throw err;

    console.error("OpenOcean Error:", err.response?.data ?? err.message);

    const timedOut = err.code === "ECONNABORTED" || /timeout/i.test(err.message || "");
    const rawMessage = err.response?.data?.errorMsg ?? err.response?.data?.error ?? err.message;
    const { code, message } = classifyUpstreamError({ httpStatus: err.response?.status, rawMessage, timedOut });
    throw new OpenOceanError(message, code);
  }
}