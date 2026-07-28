export const chainNativeTokensBySymbol: Record<number, { name: string; symbol: string }> = {
  1: { name: "eth-mainnet", symbol: "ETH" },
  10: { name: "opt-mainnet", symbol: "OP" },
  56: { name: "bnb-mainnet", symbol: "BNB" },
  137: { name: "polygon-mainnet", symbol: "POL" },
  8453: { name: "base-mainnet", symbol: "BASE" },
  42161: { name: "arb-mainnet", symbol: "ARB" },
  // 42170: { name: "arbnova-mainnet", symbol: "ETH" },
  // 42220: { name: "celo-mainnet", symbol: "CELO" },
  43114: { name: "avax-mainnet", symbol: "AVAX" },
  59144: { name: "linea-mainnet", symbol: "LINEA" },
  // 33139: { name: "apechain-mainnet", symbol: "APE" },
  324: { name: "zksync-mainnet", symbol: "ZK" },
};

export const SPECIAL_SYMBOLS: Record<number, string> = {
  143: "MON",
  10143: "MON",

  1329: "SEI",
  1328: "SEI",

  97:"BNB",
  // add more here easily
  560048:"ETH",
  
};
export const singleKey = process.env.ALCHEMY_API_KEY;
