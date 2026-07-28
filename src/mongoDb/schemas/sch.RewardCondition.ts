import { Document, Schema, model } from "mongoose";

export interface IRewardCondition extends Document {
  packageId: number;
  chainId: number;
  percentage: number; // basis points (bps)
  period:number;
  createdAt: Date;
  updatedAt: Date;
}

const RewardConditionSchema = new Schema<IRewardCondition>(
  {
    packageId: {
      type: Number,
      required: true,
      default: 1,
      max:3,
      index: true,
    },
    period: {
      type: Number,
      required: true,
      enum: [30, 60, 90],
      index: true,
    },
    chainId: {
      type: Number,
      required: true,
      index: true,
    },

    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 1000, // 100% = 10000 bps
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* Compound Index — very important for performance */
RewardConditionSchema.index({
  packageId: 1,
  chainId: 1,
  period: 1,
});

export const RewardConditionModel = model<IRewardCondition>("RewardCondition", RewardConditionSchema);
