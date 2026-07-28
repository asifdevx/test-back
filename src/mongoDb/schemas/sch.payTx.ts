import { Document, model, Schema, Types } from "mongoose";

export enum PaymentStatus {
  PENDING = "pending",
  SUCCESS = "success",
  FAILED = "failed",
}

export interface IPayment extends Document {
  sessionId: string;

  merchantId: Types.ObjectId;

  mAmount: number; // requested amount (USDT)

  chainId?: number;

  amount?: number; // In native Form
  feeAmount?: string; // In native Form

  isToken?: boolean;
  tokenAddress?: string; /// erc20 tokenAddress

  senderAddress?: string;

  txHash?: string;

  status: PaymentStatus;
  isRefund: boolean;
  isSubscription:boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    sessionId: { type: String, required: true, index: true },

    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "PayConfig",
      required: true,
      index: true,
    },

    mAmount: { type: Number, required: true },

    chainId: { type: Number, index: true },

    // what user paid
    amount: { type: Number },
    feeAmount: { type: String },

    isToken: { type: Boolean, default: false },
    tokenAddress: { type: String, lowercase: true },

    senderAddress: { type: String, lowercase: true },

    txHash: { type: String, index: true },

    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },

    isSubscription: { type: Boolean, default: false },
    isRefund: { type: Boolean, default: false },
  
  },
  { timestamps: true },
);

PaymentSchema.index({ txHash: 1 }, { unique: true, sparse: true });
// prevents duplicate blockchain tx (very important)

PaymentSchema.index({ merchantId: 1, status: 1 });
// fast dashboard queries (success, pending, etc.)

PaymentSchema.index({ merchantId: 1, createdAt: -1 });
// recent transactions per merchant

PaymentSchema.index({ chainId: 1 });
// useful if you filter by chain globally
export const PayTx = model<IPayment>("PayTx", PaymentSchema);
