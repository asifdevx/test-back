// bnb staking contract


const BNB_STAKING_HUB = "0x0000000000000000000000000000000000002002";

// polygon
const POL_STAKING_MANAGER = "0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908";

//avax
const AVAX_CHAIN_ID = 43114;

// sei

const SEI_MAINNET = 1329;
const SEI_REST_URL = "https://rest.sei-apis.com";

export const SEI_TESTNET = 1328;
export const SEI_REST_URL_TESTNET = "https://rest.atlantic-2.seinetwork.io";

// monad
const MONAD_MAINNET = 143;
const MON_STAKING_HUB = "0x0000000000000000000000000000000000001000";

const MAX_VALIDATOR_ID = 50;

export { AVAX_CHAIN_ID, BNB_STAKING_HUB, MAX_VALIDATOR_ID, MON_STAKING_HUB, MONAD_MAINNET, POL_STAKING_MANAGER, SEI_MAINNET, SEI_REST_URL };









export const unbondDelays: Record<number, number> = {

  56: 7, // BNB Mainnet
  97: 7, // BNB Testnet

  // Polygon (PoS)
  137: 3, // Polygon Mainnet (~82 checkpoints, usually 2-4 days)
  80002: 3, // Polygon Amoy Testnet

  // Avalanche (C-Chain)
  43114: 0, // Avalanche Mainnet (Fixed term; 0 days delay *after* your selected term ends)
  43113: 0, // Avalanche Fuji Testnet

  // Sei Network
  1329: 21, // Sei Mainnet
  1328: 21, // Sei Testnet

  // Monad
  143: 0.6, // Monad Mainnet (~5.5 - 11 hours / 1-2 epochs)
  10143: 0.6, // Monad Testnet
};

