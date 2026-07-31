import { Schema, model, InferSchemaType } from "mongoose";

export enum DozCandleInterval {
  ONE_MIN = "1m",
  FIVE_MIN = "5m",
  FIFTEEN_MIN = "15m",
  ONE_HOUR = "1h",
  FOUR_HOUR = "4h",
  ONE_DAY = "1d",
}

const DozPriceCandleSchema = new Schema(
  {
    interval: { type: String, enum: Object.values(DozCandleInterval), required: true },
    bucketStart: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volumeDoz: { type: Number, default: 0 },
    volumeAvax: { type: Number, default: 0 },
    trades: { type: Number, default: 0 },
  },
  { timestamps: true },
);

DozPriceCandleSchema.index({ interval: 1, bucketStart: 1 }, { unique: true });

export type DozPriceCandle = InferSchemaType<typeof DozPriceCandleSchema>;
export const DozPriceCandleModel = model<DozPriceCandle>("DozPriceCandle", DozPriceCandleSchema);