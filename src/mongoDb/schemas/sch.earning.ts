import mongoose, { model } from "mongoose";

const MarketplaceEarningSchema = new mongoose.Schema(
  {
    chainId: {
      type: Number,
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },
    isDoz: { type: Boolean },
    earnings: {
      platformFee: {
        type: Number,
        default: 0,
      },

      subscriptionFee: {
        type: Number,
        default: 0,
      },
    },
    totalForChain: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

MarketplaceEarningSchema.index({ chainId: 1, date: 1,isDoz:1 }, { unique: true });

export const Earnings = model("Earning", MarketplaceEarningSchema);
