import axios from "axios";
import { chainNativeTokensBySymbol, SPECIAL_SYMBOLS } from "../config/chainId";
import { COINMARKETCAP_KEYS } from "../config/Package";
import { DozAdminModel } from "../mongoDb/schemas/sch.DozRewordPool";
const testnet: Record<string, number> = {
  HOODI: 2327,
  TBNB: 700,
  TMON: 0.0336,
  TSEI: 0.0565,
};

function getRandomApiKey(): string {
  return COINMARKETCAP_KEYS[Math.floor(Math.random() * COINMARKETCAP_KEYS.length)];
}
const STABLE_COINS = ["USDT", "USDC", "BUSD", "DAI"];

function isStableCoin(symbol: string): boolean {
  return STABLE_COINS.includes(symbol.toUpperCase());
}
// Fetch token prices using CoinMarketCap
export async function getTokenPrices(chainId: number): Promise<number> {
  const symbol = SPECIAL_SYMBOLS[chainId] ?? chainNativeTokensBySymbol[chainId]?.symbol;

  if (!symbol) {
    console.error(`Unknown chainId: ${chainId}`);
    return 0;
  }

  return getPriceBySymbol(symbol);
}

export async function getPriceBySymbol(symbol: string): Promise<number> {
  if (!symbol) return 0;

  const upperSymbol = symbol.toUpperCase();

  // ✅ Skip API for stablecoins
  if (isStableCoin(upperSymbol)) {
    return 1;
  }
  if (upperSymbol === "DOZ") {
    const dozDetails = await DozAdminModel.findById("admin").select("dozValueInUsd");
    return dozDetails?.dozValueInUsd ?? 5112.39;
  }
  try {
    const apiKey = getRandomApiKey();

    const response = await axios.get(`${process.env.COINMARKETCAP_BASE_URL}/v1/cryptocurrency/quotes/latest`, {
      params: { symbol: upperSymbol },
      headers: {
        "X-CMC_PRO_API_KEY": apiKey,
      },
    });
  
    const data = response.data.data[upperSymbol];
    return data?.quote?.USD?.price || 0;
  } catch (err) {
    console.error(`Failed to fetch price for ${upperSymbol}:`, err);
    return 0;
  }
}
// Convert USD amount to native token
export function convertToNative(amountUSD: number, priceUSD: number): string {
  if (!priceUSD || priceUSD === 0) return "0";
  const amount = amountUSD / priceUSD;
  return amount.toFixed(18);
}

export async function getFxRates() {
  const res = await axios.get(`https://openexchangerates.org/api/latest.json`, {
    params: {
      app_id: process.env.OPEN_EXCHANGE_KEY || "5b2b03a579f243438eb90595b1931377",
      base: "USD",
      symbols: "EUR,GBP",
    },
  });

  const rates = res.data.rates;

  return {
    EUR: rates.EUR??0.85,
    GBP: rates.GBP??0.75,
  };
}
