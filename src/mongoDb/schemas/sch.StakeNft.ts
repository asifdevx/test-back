import { Document, Schema, Types, model } from "mongoose";

export enum StakeStatus {
  ACTIVE = "active",
  UNACTIVE = "unactive",
  UNBONDING = "unbonding",
  CLAIMED = "claimed",
}

export interface IStakeNFT extends Document {
  user: string;
  chainId: number;
  nftRefs: Types.ObjectId[];
  validatorId: Types.ObjectId;
  nativeAmount: string;
  rewardAmount: string;
  startedAt: Date;

  isErc1155: boolean;
  isBundle: boolean;
  APR: number;
  quantity: number;
  unlockAt: Date;
  unbondAt?: Date;
  status: StakeStatus;
  withdrawId?: string; 
  lastDistributedAt?: Date; // optional, for precise snapshot
}

const StakeNFTSchema = new Schema<IStakeNFT>(
  {
    user: { type: String, required: true, lowercase: true, index: true },
    chainId: { type: Number, required: true, index: true },
    quantity: { type: Number },

    validatorId: { type: Schema.Types.ObjectId, ref: "Validator" },
    nftRefs: [{ type: Schema.Types.ObjectId, ref: "Token" }],
    isErc1155: { type: Boolean },
    nativeAmount: { type: String, required: true },
    rewardAmount: { type: String, default: "0" },

    startedAt: { type: Date, default: Date.now },
    unlockAt: { type: Date },
    unbondAt: { type: Date },
    isBundle: { type: Boolean, default: false },
    APR: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(StakeStatus), default: StakeStatus.ACTIVE, index: true },
    withdrawId: { type: String, default: "0" },
    lastDistributedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

/* Compound index for fast queries */
StakeNFTSchema.index({ user: 1, nftRefs: 1, status: 1, startedAt: 1 });

export const StakeNFT = model<IStakeNFT>("StakeNFT", StakeNFTSchema);
