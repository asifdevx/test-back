import { Schema, model, Document, Types } from "mongoose";

export interface IStakeCoin extends Document {
  user: string;
  chainId: number;

  totalStakedAmount: number;
  pendingRewardAmount: number;
  unStakedAmount: number;
  claimAmount: number;
  APR: number;
  lastRewardAt: Date;
}

const StakeCoinSchema = new Schema<IStakeCoin>(
  {
    user: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      unique: true, // one stake record per user
    },

    chainId: {
      type: Number,
      required: true,
      index: true,
    },

    totalStakedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    pendingRewardAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    unStakedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    APR: { type: Number, default: 0 },
    claimAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastRewardAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export const StakeCoin = model<IStakeCoin>("StakeCoin", StakeCoinSchema);
