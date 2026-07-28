import { Document, model, Schema, Types } from "mongoose";

export enum BusinessStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export interface IDirector {
  name: string;
  dob: Date;
}

export interface IBusinessKyc extends Document {
  userId: Types.ObjectId;
  companyName: string;
  dba?: string;
  country: string;
  regAddress: string;
  bizAddress: string;
  description?: string;
  regNumber: string;
  vatNumber?: string;
  regions: string[];
  status: BusinessStatus;
  regCertificate: string; // URL from S3/Cloudinary
  directors: IDirector[];
  // New Fields from PayForm
  storeName: string;
  socialMedia: string;
  businessTypes: string[];
  proofOfSettlement: string; // URL from S3/Cloudinary
}

const DirectorSchema = new Schema<IDirector>({
  name: { type: String, required: true },
  dob: { type: Date, required: true },
});

const BusinessKycSchema = new Schema<IBusinessKyc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Profile",
      required: true,
      index: true,
    },
    companyName: { type: String, lowercase: true, required: true, trim: true },
    dba: { type: String, lowercase: true, trim: true },
    storeName: { type: String, required: true, trim: true },
    socialMedia: { type: String, required: true, trim: true },

    country: { type: String, lowercase: true, required: true },
    regAddress: { type: String, required: true },
    bizAddress: { type: String, required: true },

    description: { type: String },
    regNumber: { type: String, required: true },
    vatNumber: { type: String, lowercase: true },

    directors: [DirectorSchema],
    businessTypes: [{ type: String }],
    regions: [{ type: String }],

    regCertificate: { type: String, required: true },
    proofOfSettlement: { type: String, required: true },

    status: {
      type: String,
      enum: Object.values(BusinessStatus),
      default: BusinessStatus.PENDING,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster lookups in the merchant dashboard
BusinessKycSchema.index({ companyName: "text", storeName: "text" });

export const BusinessKyc = model<IBusinessKyc>("BusinessKyc", BusinessKycSchema);
