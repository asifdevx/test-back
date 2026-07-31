// mongoDb/schemas/sch.dozPriceTick.ts
import { Schema, model, InferSchemaType } from "mongoose";

const DozPriceTickSchema = new Schema(
  {
    txHash: { type: String, required: true, unique: true, lowercase: true, trim: true },
    priceAvax: { type: Number, required: true }, 
    priceUsd: { type: Number, required: true },  
    zeroForOne: { type: Boolean, required: true },
    amountDoz: { type: Number, required: true },
    amountAvax: { type: Number, required: true },
    walletAddress: { type: String, lowercase: true, trim: true },
    tradedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

export type DozPriceTick = InferSchemaType<typeof DozPriceTickSchema>;
export const DozPriceTickModel = model<DozPriceTick>("DozPriceTick", DozPriceTickSchema);