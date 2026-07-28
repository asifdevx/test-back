import { Document, Schema, model } from "mongoose";

type PkgId = 0 | 1 | 2 | 3;

interface IPackage {
  pkgId: PkgId;
  expireAt: Date;
}

export interface ISubscription extends Document {
  address: string;
  packages: {
    nft?: IPackage;
    business?: IPackage;
  };
  createdAt: Date;
  updatedAt: Date;
}
const getNextMonthDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
};

const PackageSchema = new Schema<IPackage>(
  {
    pkgId: {
      type: Number,
      enum: [0, 1, 2, 3],
      required: true,
    },
    expireAt: {
      type: Date,
      default: getNextMonthDate,
      required: true,
    },
  },
  { _id: false },
);

const SubscriptionSchema = new Schema<ISubscription>(
  {
    address: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    packages: {
      nft: {
        type: PackageSchema,
        required: false,
      },
      business: {
        type: PackageSchema,
        required: false,
      },
    },
  },
  {
    timestamps: true,
  },
);
SubscriptionSchema.index({ "packages.nft.expireAt": 1 });
SubscriptionSchema.index({ "packages.business.expireAt": 1 });

export const SubscriptionModel = model<ISubscription>("Subscription", SubscriptionSchema);
