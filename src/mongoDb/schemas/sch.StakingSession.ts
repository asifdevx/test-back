import { Schema, model, Document } from "mongoose";


// 0 = created
// 1 = fee paid
// 2 = coin staked
// 3 = nft approved
// 4 = nft staked


export interface IStakingSession extends Document {
  address: string;
  chainId: number;
  isBundle: boolean;
  stakeAmount: string;
  nftIds?: string[];
  step: number;
  feeTx?: string;
  coinTx?: string;
  nftApproveTx?: string;
  nftStakeTx?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StakingSessionSchema = new Schema<IStakingSession>(
  {
    address: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    chainId: {
      type: Number,
      required: true,
      index: true,
    },

    isBundle: {
      type: Boolean,
      required: true,
    },

    stakeAmount: {
      type: String,
      required: true,
    },

    nftIds: {
      type: [String],
      default: undefined,
    },

    step: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 4,
      index: true,
    },

    feeTx: {
      type: String,
      default: undefined,
    },

    coinTx: {
      type: String,
      default: undefined,
    },

    nftApproveTx: {
      type: String,
      default: undefined,
    },

    nftStakeTx: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const StakingSessionModel = model<IStakingSession>("staking_sessions", StakingSessionSchema);
