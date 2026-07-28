export const PACKAGES = {
  0: { priceUSD: 0, feeBps: 250 }, // 2.5% -> 250 bps
  1: { priceUSD: 49, feeBps: 200 }, // 2.0%
  2: { priceUSD: 499, feeBps: 150 }, // 1.5%
  3: { priceUSD: 999, feeBps: 100 }, // 1.0%
};

export const PERIOD_SECONDS = 30 * 24 * 3600;


export const COINMARKETCAP_KEYS = [process.env.COIN_API1!, process.env.COIN_API2!];
