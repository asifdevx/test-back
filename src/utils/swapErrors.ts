// src/utils/swapErrors.ts

export enum SwapErrorCode {
  INVALID_PARAMS = "INVALID_PARAMS", // missing/malformed request fields
  AMOUNT_TOO_LOW = "AMOUNT_TOO_LOW", // dust amount, provider rejects or output rounds to 0
  AMOUNT_TOO_HIGH = "AMOUNT_TOO_HIGH", // exceeds available liquidity for the pool/route
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE", // caller doesn't hold enough of fromToken (rare server-side; mostly caught client-side)
  NO_ROUTE = "NO_ROUTE", // provider found no path between the two tokens
  UNSUPPORTED_CHAIN = "UNSUPPORTED_CHAIN", // chain not covered by this provider
  UNSUPPORTED_PAIR = "UNSUPPORTED_PAIR", // e.g. DOZ AMM hit with a non-DOZ/AVAX pair
  SLIPPAGE_TOO_LOW = "SLIPPAGE_TOO_LOW", // provider rejected the requested slippage as too tight
  RATE_LIMITED = "RATE_LIMITED", // 429 from upstream provider
  TIMEOUT = "TIMEOUT", // upstream call took too long
  UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE", // 5xx / network failure from upstream provider
  MISCONFIGURED = "MISCONFIGURED", // missing API key / bad env — ours to fix, not the user's
  UNKNOWN = "UNKNOWN",
}

export class SwapServiceError extends Error {
  code: SwapErrorCode;
  /** HTTP status this should surface as. Defaults chosen per code in toHttpStatus(). */
  status?: number;

  constructor(code: SwapErrorCode, message: string, status?: number) {
    super(message);
    this.name = "SwapServiceError";
    this.code = code;
    this.status = status;
  }
}

/** Maps a SwapErrorCode to a sensible default HTTP status if one wasn't set explicitly. */
export function toHttpStatus(err: SwapServiceError): number {
  if (err.status) return err.status;
  switch (err.code) {
    case SwapErrorCode.INVALID_PARAMS:
    case SwapErrorCode.AMOUNT_TOO_LOW:
    case SwapErrorCode.AMOUNT_TOO_HIGH:
    case SwapErrorCode.UNSUPPORTED_CHAIN:
    case SwapErrorCode.UNSUPPORTED_PAIR:
    case SwapErrorCode.SLIPPAGE_TOO_LOW:
    case SwapErrorCode.INSUFFICIENT_BALANCE:
      return 400;
    case SwapErrorCode.RATE_LIMITED:
      return 429;
    case SwapErrorCode.TIMEOUT:
      return 504;
    case SwapErrorCode.NO_ROUTE:
    case SwapErrorCode.UPSTREAM_UNAVAILABLE:
      return 502;
    case SwapErrorCode.MISCONFIGURED:
      return 500;
    default:
      return 502;
  }
}


export function classifyUpstreamError(opts: { httpStatus?: number; rawMessage?: string; timedOut?: boolean }): { code: SwapErrorCode; message: string } {
  const { httpStatus, timedOut } = opts;
  const raw = (opts.rawMessage || "").toLowerCase();

  if (timedOut) return { code: SwapErrorCode.TIMEOUT, message: "The price provider took too long to respond. Please try again." };
  if (httpStatus === 429) return { code: SwapErrorCode.RATE_LIMITED, message: "Too many requests right now — please wait a moment and try again." };
  if (httpStatus && httpStatus >= 500) return { code: SwapErrorCode.UPSTREAM_UNAVAILABLE, message: "The price provider is temporarily unavailable. Please try again shortly." };

  if (/insufficient.*liquidity|not enough liquidity|liquidity.*insufficient/.test(raw)) {
    return { code: SwapErrorCode.AMOUNT_TOO_HIGH, message: "This amount is too large for the available liquidity. Try a smaller amount." };
  }
  if (/no route|route not found|cannot find route|no.*path/.test(raw)) {
    return { code: SwapErrorCode.NO_ROUTE, message: "No route found for this pair. Try a different token or amount." };
  }
  if (/amount.*(too small|too low)|dust|minimum amount/.test(raw)) {
    return { code: SwapErrorCode.AMOUNT_TOO_LOW, message: "This amount is too small to swap. Try a larger amount." };
  }
  if (/slippage/.test(raw)) {
    return { code: SwapErrorCode.SLIPPAGE_TOO_LOW, message: "Price moved beyond your slippage tolerance. Try increasing slippage or retry." };
  }
  if (/insufficient.*balance|insufficient funds/.test(raw)) {
    return { code: SwapErrorCode.INSUFFICIENT_BALANCE, message: "Insufficient balance for this swap." };
  }

  return { code: SwapErrorCode.UNKNOWN, message: opts.rawMessage || "Failed to fetch a quote. Please try again." };
}

/** Wraps a promise with a hard timeout, throwing a distinguishable TimeoutError instead of hanging forever. */
export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
