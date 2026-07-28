import { InferSchemaType, Schema, model } from "mongoose";

// 1. Define the child schema
const SwapSideSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    address: { type: String, required: true, lowercase: true, trim: true },
    amount: { type: String, required: true }, // wei
  },
  { _id: false },
);

// 2. Define the main schema
const SwapTransactionSchema = new Schema(
  {
    walletAddress: { type: String, required: true, lowercase: true, trim: true, index: true },
    isCrossChain: { type: Boolean, default: false, index: true },
    // toolName from IUnifiedQuote — "0x", "OpenOcean", "Relay", "Mayan", "DOZ AMM", etc.
    route: { type: String, default: "", trim: true },
    from: { type: SwapSideSchema, required: true },
    to: { type: SwapSideSchema, required: true },
    txHash: { type: String, required: true, unique: true, lowercase: true, trim: true },
    explorerUrl: { type: String, default: "" },
  },
  { timestamps: true },
);


export type SwapTx = InferSchemaType<typeof SwapTransactionSchema>;

export const SwapTransaction = model<SwapTx>("SwapTransaction", SwapTransactionSchema);
