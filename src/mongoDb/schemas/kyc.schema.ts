import { Document, Schema, model } from 'mongoose';
import * as T from "../../types/index";

const KycSchema = new Schema(
  {
    address: { type: String, lowercase: true, required: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "needs_info"],
      default: "pending",
    },

    personalInfo: {
      firstName: {
        type: String,
        required: true,
      },
      lastName: {
        type: String,
        required: true,
      },
      country: { type: String, lowercase: true },
      state: { type: String },
      city: { type: String },
      streetAddress: { type: String },
      postalCode: { type: String },
      passPortId: { type: String },
      socialSecurity: { type: String },
      nationality: { type: String,lowerCase:true },
      dob: { type: Date },
    },

    documents: {
      nidFront: {
        value: { type: String }, // Cloudinary URL
        status: { type: String, enum: ["pending", "approved", "rejected", "needs_info"], default: "pending" },
        notes: { type: String },
      },
      utilityBill: {
        value: { type: String }, // Cloudinary URL
        status: { type: String, enum: ["pending", "approved", "rejected", "needs_info"], default: "pending" },
        notes: { type: String },
      },
      selfieWithId: {
        value: { type: String }, // Cloudinary URL
        status: { type: String, enum: ["pending", "approved", "rejected", "needs_info"], default: "pending" },
        notes: { type: String },
      },
    },
  },
  { timestamps: true },
);

KycSchema.methods.recalculateStatus = function () {
  const statuses: T.Status[] = [];

  for (const key in this.documents) {
    const doc = this.documents[key] as { status: T.Status }; 
    if (doc.status) {
      statuses.push(doc.status);
    }
  }

  if (statuses.includes('rejected')) this.status = 'rejected';
  else if (statuses.includes('needs_info')) this.status = 'needs_info';
  else if (statuses.every((s) => s === 'approved')) this.status = 'approved';
  else this.status = 'pending';

};

export type KycDocument = Document & T.IKyc;
export const Kyc = model<KycDocument>('Kyc', KycSchema);
