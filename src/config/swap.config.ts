// src/config/swap.config.ts
import env from "../constant/env";

export const OPENOCEAN_CHAIN_SLUG: Record<number, string> = {
  1: "eth",
  56: "bsc",
  137: "polygon",
  42161: "arbitrum",
  43114: "avax",
  10: "optimism",
  8453: "base",
  143: "monad",
  1329: "sei",
  59144: "linea",
};

export const MAYAN_CHAIN_NAME: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  137: "polygon",
  42161: "arbitrum",
  43114: "avalanche",
  10: "optimism",
  8453: "base",
  143: "monad",
  1329: "sei",
  59144: "linea",
};

export const ZEROEX_SUPPORTED_CHAINS = new Set([1, 10, 56, 137, 143, 1329, 8453, 42161, 43114, 59144]);

/** Request In MiliSec  */

export const DOZ_RPC_TIMEOUT_MS = 20_000;
export const MAYAN_TIMEOUT_MS = 25_000;
export const OPEN_OCEAN_REQUEST_TIMEOUT_MS = 20_000;
export const RELAY_REQUEST_TIMEOUT_MS = 25_000;
export const ZEROEX_REQUEST_TIMEOUT_MS = 20_000;


export const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

export const TREASURY_ADDRESS = process.env.SWAP_TREASURY_ADDRESS || "";

export const MAX_SLIPPAGE_BPS = 5000; // 50% — anything higher is almost certainly a UI bug, not user intent
export const MIN_SLIPPAGE_BPS = 1; // 0.01%
export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;


export const DOZ_AMM_DEADLINE_MINUTES = 20;

// ── Chain-specific config ───────────────────────────────────────────────────

export const DOZ_AVAX_CHAIN_ID = env.node_env === "test" ? 560048 : 43114;
export const DOZ_TOKEN_ADDRESS = process.env.DOZ_TOKEN!;
export const WAVAX_ADDRESS = process.env.WAVAX_TOKEN!; 



export const OPENOCEAN_BASE_URL = "https://open-api.openocean.finance/v4";
export const OPENOCEAN_NATIVE_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const ZEROEX_BASE_URL = "https://api.0x.org";
export const ZEROEX_API_KEY = "02e4ea61-2b6d-4237-b82e-af834891d4cd";
export const ZEROEX_NATIVE_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/** Chains 0x currently prices on — extend as needed. */



export const RELAY_BASE_URL = "https://api.relay.link";
export const RELAY_API_KEY = "66b1a853-cc4c-4323-a5f7-1d45eeac29ca"; 

/** Mayan's referrerBps is a small integer (documented examples use 5 = 0.05%);
 *  override via env if Mayan confirms a higher cap for your integration. */
export const MAYAN_REFERRER_BPS = Number(process.env.MAYAN_REFERRER_BPS ?? 5);


