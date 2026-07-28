import dotenv from "dotenv";
import REWARD_ABI from "../ABI/DozReward.json";
import ERC1155_FACTORY_ABI from "../ABI/ERC1155COLLECTION.json";
import ERC721_FACTORY_ABI from "../ABI/ERC721COLLECTION.json";
import MARKETPLACE_ABI from "../ABI/MARKETPLACE.json";
import PAYGATEWAY_ABI from "../ABI/PAYGATEWAY.json";
import PAYMENT_ABI from "../ABI/PAYMENT.json";
import STAKING_ABI from "../ABI/Stake.json";
dotenv.config();

export type EventType = "ERC721" | "ERC1155" | "MARKETPLACE" | "PAYMENT" | "ERC721FACTORY" | "ERC1155FACTORY" | "STAKING" | "REWARD" | "PAY";
type ChainKey = "ETHEREUM" | "OPTIMISM" | "BSC" | "POLYGON" | "BASE" | "ARBITRUM" | "AVALANCHE" | "LINEA" | "MONAD" | "SEI";
const REWARD_CHAIN = "AVALANCHE";

interface ContractConfig {
  chainId: number;
  type: EventType;
  wsRpc: string;
  address: string;
  abi: any;
  events: string[];
}

interface ChainConfig {
  chainId: number;
  rpc: string;
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  ETHEREUM: { chainId: 1, rpc: process.env.RPC_ETHEREUM! },
  OPTIMISM: { chainId: 10, rpc: process.env.RPC_OPTIMISM! },
  BSC: { chainId: 56, rpc: process.env.RPC_BSC! },
  POLYGON: { chainId: 137, rpc: process.env.RPC_POLYGON! },
  BASE: { chainId: 8453, rpc: process.env.RPC_BASE! },
  ARBITRUM: { chainId: 42161, rpc: process.env.RPC_ARBITRUM! },
  AVALANCHE: { chainId: 43114, rpc: process.env.RPC_AVALANCHE! },
  LINEA: { chainId: 59144, rpc: process.env.RPC_LINEA! },
  MONAD: { chainId: 143, rpc: process.env.RPC_MONAD! },
  // ZKSYNC: { chainId: 324, rpc: process.env.RPC_ZKSYNC! },
  SEI: { chainId: 1329, rpc: process.env.RPC_SEI! },
};
const stakingChains: ChainKey[] = ["BSC", "AVALANCHE", "POLYGON", "SEI", "MONAD"];

const makeContracts = (key: ChainKey): ContractConfig[] => {
  const { chainId, rpc } = CHAINS[key];
  const contracts: ContractConfig[] = [];
  if (rpc && key !== "BSC") {
    contracts.push(
      {
        chainId,
        type: "ERC721FACTORY",
        wsRpc: rpc,
        address: process.env[`ERC721_${key}`]!,
        abi: ERC721_FACTORY_ABI,
        events: ["CollectionCreated"],
      },
      {
        chainId,
        type: "ERC1155FACTORY",
        wsRpc: rpc,
        address: process.env[`ERC1155_${key}`]!,
        abi: ERC1155_FACTORY_ABI,
        events: ["CollectionCreated"],
      },
      {
        chainId,
        type: "PAYMENT",
        wsRpc: rpc,
        address: process.env[`PACKAGE_${key}`]!,
        abi: PAYMENT_ABI,
        events: key === REWARD_CHAIN ? ["PackagePurchased", "PackagePurchasedERC20"] : ["PackagePurchased"],
      },
      {
        chainId,
        type: "MARKETPLACE",
        wsRpc: rpc,
        address: process.env[`MARKETPLACE_${key}`]!,
        abi: MARKETPLACE_ABI,
        events: ["BatchOrderFilled"],
      },
      {
        chainId,
        type: "PAY",
        wsRpc: rpc!,
        address: process.env[`PAY_${key}`]!,
        abi: PAYGATEWAY_ABI,
        events: ["PaymentSuccess", "Refunded"],
      },
    );
  }

  if (stakingChains.includes(key)) {
    contracts.push({
      chainId,
      type: "STAKING",
      wsRpc: rpc!,
      address: process.env[`STAKING_${key}`]!,
      abi: STAKING_ABI,
      events: ["NFTStaked", "NFTWithdrawn"],
    });
  }

  if (key == REWARD_CHAIN) {
    contracts.push({
      chainId,
      type: "REWARD",
      wsRpc: rpc!,
      address: process.env.REWARD_DOZ!,
      abi: REWARD_ABI,
      events: ["Deposited", "Withdrawn", "Claimed"],
    });
  }
  return contracts;
};

export const contracts: ContractConfig[] = [
  ...makeContracts("ETHEREUM"),
  ...makeContracts("OPTIMISM"),
  ...makeContracts("BSC"),
  ...makeContracts("POLYGON"),
  ...makeContracts("BASE"),
  ...makeContracts("ARBITRUM"),
  ...makeContracts("AVALANCHE"),
  ...makeContracts("LINEA"),
  ...makeContracts("MONAD"),
  ...makeContracts("SEI"),
];
