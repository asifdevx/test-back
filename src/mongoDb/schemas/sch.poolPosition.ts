import { Schema, model, models, type Document } from "mongoose";


export interface PoolPositionDoc extends Document {
  owner: string; // lowercase address — matches router's positionOwner
  poolAddress: string;
  routerAddress: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string; // last known on-chain liquidity, as decimal string
  status: "active" | "removed";
  mintTxHash: string;
  lastTxHash: string; // most recent action (mint, add, or partial remove)
  removeTxHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PoolPositionSchema = new Schema<PoolPositionDoc>(
  {
    owner: { type: String, required: true, lowercase: true, index: true },
    poolAddress: { type: String, required: true, lowercase: true },
    routerAddress: { type: String, required: true, lowercase: true },
    tickLower: { type: Number, required: true },
    tickUpper: { type: Number, required: true },
    liquidity: { type: String, required: true },
    status: { type: String, enum: ["active", "removed"], default: "active", index: true },
    mintTxHash: { type: String, required: true },
    lastTxHash: { type: String, required: true },
    removeTxHash: { type: String },
  },
  { timestamps: true },
);

// One row per range per owner per pool — mint-again-into-same-range upserts
// instead of duplicating.
PoolPositionSchema.index({ owner: 1, poolAddress: 1, tickLower: 1, tickUpper: 1 }, { unique: true });

export const PoolPosition = models.PoolPosition || model<PoolPositionDoc>("PoolPosition", PoolPositionSchema);
