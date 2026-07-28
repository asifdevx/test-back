import { Document, model, Schema, Types } from "mongoose";

export enum SubscriptionStatus {
  ACTIVE = "active",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
}

export interface ISubscription extends Document {
  merchantId: Types.ObjectId;

  address: string;
  email: string;

  sessionIds: Types.ObjectId[];

  amount: number;

  isMonthly: boolean;

  nextBillingDate: Date;

  status: SubscriptionStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

const SubscriptionTxSchema = new Schema<ISubscription>(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "PayConfig",
      required: true,
      index: true,
    },

    address: {
      type: String,
      lowercase: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    sessionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "PayTx",
      },
    ],

    amount: {
      type: Number,
      required: true,
    },

    isMonthly: {
      required: true,
      type: Boolean,
      default: true,
    },

    nextBillingDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.ACTIVE,
      index: true,
    },
  },
  { timestamps: true },
);

SubscriptionTxSchema.index({ merchantId: 1, status: 1 });
SubscriptionTxSchema.index({ address: 1, status: 1 });
SubscriptionTxSchema.index({ nextBillingDate: 1 });

export const PaySubscriptionTxModel = model<ISubscription>("SubscriptionTx", SubscriptionTxSchema);
