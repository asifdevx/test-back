import { Document, model, Schema } from "mongoose";

export enum PricingMode {
  NFT = "nft",
  BUSINESS = "business",
}

export interface IPricing extends Document {
  mode: PricingMode;
  pkgId: number; // 0 → 3 (fixed slots)
  title: string;
  fee: number; // in bps (e.g. 250 = 2.5%)
  amount: number;
}

const PricingSchema = new Schema<IPricing>(
  {
    mode: {
      type: String,
      enum: Object.values(PricingMode),
      required: true,
      index: true,
    },

    pkgId: {
      type: Number,
      required: true,
      min: 0,
      max: 3,
    },

    title: { type: String, required: true },

    fee: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { timestamps: true },
);

PricingSchema.index({ mode: 1, pkgId: 1 }, { unique: true });

export const Pricing = model<IPricing>("Pricing", PricingSchema);
