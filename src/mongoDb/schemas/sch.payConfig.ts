import { Document, Schema, Types, model } from "mongoose";

/* ───────────────────────────── TYPES ───────────────────────────── */

interface IDirector {
  _id: Types.ObjectId;
  address: string;
  isApproved: boolean;
  addedAt?: Date;
}

interface IApiKey {
  _id: Types.ObjectId;
  label:string;
  publicKey: string;
  apiKeyHash: string;
  apiKeyLast4: string;
  isActive: boolean;
  createdAt: Date;
}

export interface IPaymentConfig extends Document {
  creatorAddress: string;

  receiverAddress: string;
  redirectUrl?: string;

  keys: Types.DocumentArray<IApiKey>;
  directors: Types.DocumentArray<IDirector>;

  pkgId: 0 | 1 | 2 | 3;
  txCount?: number;

  createdAt: Date;
  updatedAt: Date;
}

/* ───────────────────────────── SCHEMA ───────────────────────────── */

const PaymentConfigSchema = new Schema<IPaymentConfig>(
  {
    creatorAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true, // one config per creator
    },

    receiverAddress: {
      type: String,

      lowercase: true,
      trim: true,
    },

    redirectUrl: {
      type: String,
      trim: true,
    },

    keys: [
      {
        label: {
          type: String,
          required: true,
        },
        publicKey: {
          type: String,
          required: true,
          trim: true,
        },
        apiKeyHash: {
          type: String,
          required: true,
        },
        apiKeyLast4: {
          type: String,
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    pkgId: {
      type: Number,
      enum: [0, 1, 2, 3],
      default: 0,
    },

    directors: [
      {
        address: {
          type: String,
          lowercase: true,
          required: true,
          trim: true,
        },
        isApproved: {
          type: Boolean,
          default: false,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    txCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

/* ───────────────────────────── INDEXES ───────────────────────────── */

// 🔥 1. Primary lookup (VERY IMPORTANT)
PaymentConfigSchema.index({ creatorAddress: 1 });

// 🔥 2. Fast auth lookup (critical path)
PaymentConfigSchema.index({ "keys.publicKey": 1 });

// 🔥 3. Enforce global uniqueness of publicKey
PaymentConfigSchema.index({ "keys.publicKey": 1 });

// 🔥 4. Director lookup (for access control)
PaymentConfigSchema.index({ "directors.address": 1 });

// 🔥 5. Approved director lookup (optimized)
PaymentConfigSchema.index({
  "directors.address": 1,
  "directors.isApproved": 1,
});

// 🔥 6. Optional: analytics / sorting
PaymentConfigSchema.index({ createdAt: -1 });

/* ───────────────────────────── MODEL ───────────────────────────── */

export const PayConfig = model<IPaymentConfig>("PayConfig", PaymentConfigSchema);
