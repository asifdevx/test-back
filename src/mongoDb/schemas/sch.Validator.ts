import { Document, Schema, model } from "mongoose";

export interface IValidator extends Document {
  chainId: number;
  validatorId: string; // operatorAddress / validatorId etc
  name?: string; // optional human readable
  status: "active" | "inactive" | "jailed";
  creditContract?: string; // using for bnb to compute balance or ect
  totalDelegated: string; // total coins delegated to validator
  commissionRate: number; // 0-100 %
  minDelegation: string; // minimum amount user can delegate in normal mode
  lastTotalReward: string;
  apr?: number; // current validator reward %
  lastChecked: Date; // last health check
  isHealthy: boolean;
  endTime?: number; // when the validator stop giving reward\
  lastTotalStake?: string;
  lastDistributedAt?: Date;
  lastRewardPerStake?: string;
}

const ValidatorSchema = new Schema<IValidator>(
  {
    chainId: {
      type: Number,
      required: true,
      index: true,
    },
    validatorId: { type: String, required: true, index: true, lowercase: true },
    creditContract: { type: String, index: true, lowercase: true },
    name: { type: String },
    status: {
      type: String,
      enum: ["active", "inactive", "jailed"],
      default: "active",
    },
    totalDelegated: { type: String, default: "0" }, // use string for big numbers
    commissionRate: { type: Number, default: 0 },
    minDelegation: { type: String, default: "0" }, // minimum user can delegate
    endTime: { type: Number },
    apr: { type: Number },
    lastChecked: { type: Date, default: Date.now },
    isHealthy: { type: Boolean, default: true },
    lastRewardPerStake:{type:String},
    lastTotalStake: { type: String },
    lastTotalReward: { type: String },
    lastDistributedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

/* Compound index for fast queries */
ValidatorSchema.index({ chain: 1, validatorId: 1 }, { unique: true });
ValidatorSchema.index({ chain: 1, isHealthy: 1, apr: -1 });

export const Validator = model<IValidator>("Validator", ValidatorSchema);
