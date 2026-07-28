import { Document, Schema, model } from "mongoose";

export enum StakeType {
  BUNDLE = "bundle", // NFT + Native
  COIN = "coin", // Native only
  TOKEN = "token", // DOZ (ERC20)
}

export enum StakeEventType {
  STAKE = "stake",
  UNBOND = "unbond",
  CLAIM = "claim",
}

export interface IStakeEvent extends Document {
  chainId: number;
  stakeType: StakeType;
  eventType: StakeEventType;
  address: string;
  amount: string;
  txHash?: string;
  timestamp: Date;
}

const StakeEventSchema = new Schema<IStakeEvent>(
  {
    chainId: { type: Number, required: true, index: true },

    stakeType: {
      type: String,
      enum: Object.values(StakeType),
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      enum: Object.values(StakeEventType),
      required: true,
      index: true,
    },

    address: { type: String, required: true, lowercase: true, index: true },

    amount: { type: String, required: true },

    txHash: {
      type: String,
      sparse: true,
      index: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

/* 🔥 Correct Compound Indexes */
StakeEventSchema.index({ address: 1, chainId: 1, timestamp: -1 });
StakeEventSchema.index({ chainId: 1, stakeType: 1, eventType: 1, timestamp: -1 });

export const StakeEventModel = model<IStakeEvent>("StakeEvent", StakeEventSchema);
