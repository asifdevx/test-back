import { UserRoles } from "../mongoDb/schemas/sch.userProfile";

export interface KycDetails {
  address: string;

  personalInfo: {
    firstName: string;
    lastName: string;
    country?: string;
    state?: string;
    city?: string;
    streetAddress?: string;
    postalCode?: string;
    dob?: Date;
  };
  documents: Record<string, { value: string }>;
}

export type Status = "pending" | "approved" | "rejected" | "needs_info";

export interface IKyc {
  address: string;
  status?: Status;
  personalInfo: {
    firstName: string;
    lastName: string;
    country?: string;
    state?: string;
    city?: string;
    streetAddress?: string;
    postalCode?: string;
    dob?: Date;
  };
  documents: Record<
    string,
    {
      value: string;
      status: Status;
      notes?: string;
    }
  >;
  recalculateStatus?: () => void;
}

export interface Payload {
  chainId: number;
  type: string;
  address: string; // The contract that emitted the event
  event: {
    transactionHash: string;
    blockNumber: number;
    index: number;
    args: any; // Plain object, not ethers Result
  };
}

export interface UserPayload {
  address: string;
  role: UserRoles;
  isAdmin: boolean;
  token: string;
  nonce?: string;
  iat?: number;
}

// ---- Swap -----------------------------


export type QuoteRoute = "doz-amm" | "openocean" | "0x" | "relay" | "mayan";

export interface UnifiedQuoteRequest {

  routeHint?: "doz" | "aggregate" | "bridge";
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  slippageBps?: number; 
  fromTokenDecimals?: number;
}

export interface UnifiedTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  chainId:number
}

export interface UnifiedTransactionRequest {
  chainId: number;
  to: string;
  data: string;
  value: string; // decimal wei string
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface UnifiedQuote {
  route: QuoteRoute;
  toolName: string; 
  isCrossChain: boolean;
  fromToken: UnifiedTokenInfo;
  toToken: UnifiedTokenInfo;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  feeBps: number;
  feeAmount: string;
  feeToken: string;
  estimatedGas?: string;
  executionDurationSeconds: number;
 
  transactionRequest: UnifiedTransactionRequest;

  steps?: UnifiedTransactionRequest[];
  
  approval: { token: string; spender: string; amount: string } | null;
 
  statusCheck?: { url: string; method: "GET" | "POST" };
  
  dozAmmMeta?: {
    zeroForOne: boolean;
    sqrtPriceX96After: string;
    partialFill: boolean;
  };
}