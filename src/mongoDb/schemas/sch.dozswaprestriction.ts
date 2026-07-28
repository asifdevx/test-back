import { Document, Schema, model } from "mongoose";


export enum DozSwapDirectionLock {
  NONE = "none",
  DISABLE_FROM_DOZ = "disable-from-doz",
  DISABLE_FROM_AVAX = "disable-from-avax",
  DISABLE_ALL = "disable-all",
}

export const DOZ_SWAP_RESTRICTION_KEY = "doz-avax";

export interface IDozSwapRestriction extends Document {
  key: string;
  mode: DozSwapDirectionLock;
  reason?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DozSwapRestrictionSchema = new Schema<IDozSwapRestriction>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: DOZ_SWAP_RESTRICTION_KEY,
    },
    mode: {
      type: String,
      enum: Object.values(DozSwapDirectionLock),
      default: DozSwapDirectionLock.NONE,
      required: true,
    },
    reason: {
      type: String,
      default: "",
    },
    updatedBy: {
      type: String,
    },
  },
  { timestamps: true },
);

export const DozSwapRestriction = model<IDozSwapRestriction>("DozSwapRestriction", DozSwapRestrictionSchema);
