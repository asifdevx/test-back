import { Document, model, Schema } from "mongoose";

export enum PlatFormType {
  SUBSCRIPTION = "Subscription Fee",
  STAKE = "Staking Fee",
  SELL = "Sell Fee",
}
export interface IPlatformFee extends Document {
  address: string;
  chainId: number;
  type: PlatFormType;
  txHash?: string;
  amount: string; /// in wei
  isDoz: boolean;
}

const FeeEventSchema = new Schema<IPlatformFee>(
  {
    address: { type: String, required: true, lowercase: true, index: true },
    chainId: { type: Number, required: true, index: true },
    amount: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(PlatFormType),
      required: true,
      index: true,
    },
    isDoz: { type: Boolean, default: false },
    txHash: {
      type: String,
      sparse: true,
      index: true,
    },
  },
  { timestamps: true,versionKey:false },
);

FeeEventSchema.index({ address: 1, type: 1 });

FeeEventSchema.index({ chainId: 1, type: 1 });

FeeEventSchema.index({ isDoz: 1 });

FeeEventSchema.index({ type: 1, isDoz: 1 });
export const FeeEventModel = model<IPlatformFee>("FeeEvent", FeeEventSchema);
