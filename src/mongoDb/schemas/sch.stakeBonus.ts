import mongoose, { Document, Schema } from "mongoose";

export interface IStakeBonus extends Document {
  user: string;
  amount: number;
  nonce: number;
}

const UserSchema = new Schema<IStakeBonus>({
  user: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  },

  nonce: {
    type: Number,
    default: 1,
  },
  amount: {
    type: Number,
    default: 0,
  },
});

export const StakeBonus = mongoose.model<IStakeBonus>("DozReward", UserSchema);