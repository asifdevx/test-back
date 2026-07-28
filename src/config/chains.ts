export const CHAIN_SLUG: Record<number, string> = {
  // Mainnets
  1: "ethereum",
  56: "bsc",
  137: "polygon",
  43114: "avalanche",
  1329: "sei",
  143: "monad",
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
  59144: "linea",

  // Testnets & Custom
  10143: "monadTestnet",
  1328: "seiTestnet",
  97: "bscTestnet",
  560048: "hoodi",
};

export const NATIVE_TOKENS: Record<number, { name: string; logo: string; symbol: string; wrappedAddress: string }> = {
  1: {
    name: "Ethereum",
    logo: "/img/chains/eth.svg",
    symbol: "ETH",
    wrappedAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  },
  56: {
    name: "BNB Chain",
    logo: "/img/chains/bsc.svg",
    symbol: "BNB",
    wrappedAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095", // WBNB
  },
  137: {
    name: "Polygon",
    logo: "/img/chains/pol.png",
    symbol: "POL",
    wrappedAddress: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WPOL / WMATIC
  },
  43114: {
    name: "Avalanche",
    logo: "/img/chains/avax.svg",

    symbol: "AVAX",
    wrappedAddress: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c", // WAVAX
  },
  1329: {
    name: "Sei",
    logo: "/img/chains/sei.svg",

    symbol: "SEI",
    wrappedAddress: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7", // WSEI
  },
  143: {
    name: "Monad",
    logo: "/img/chains/monad.jpg",
    symbol: "MON",
    wrappedAddress: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A", // WMON
  },
  42161: {
    name: "Arbitrum",
    logo: "/img/chains/arb.svg",
    symbol: "ARB",
    wrappedAddress: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
  },
  8453: {
    name: "Base",
    logo: "/img/chains/base.png",

    symbol: "BASE",
    wrappedAddress: "0x4200000000000000000000000000000000000006", // WETH
  },
  10: {
    name: "Optimism",
    logo: "/img/chains/op.svg",

    symbol: "OPT",
    wrappedAddress: "0x4200000000000000000000000000000000000006", // WETH
  },
  59144: {
    name: "Linea",
    logo: "/img/chains/linea.png",

    symbol: "LIN",
    wrappedAddress: "0xe5D7C2a44Ff53b8277257c7c00689b7A11904719", // WETH
  },
};
