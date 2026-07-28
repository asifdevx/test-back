import mongoose, { Document, Schema } from "mongoose";

export interface IAdmin extends Document {
  _id: string;
  contractBalance: string; // wei
  minWithdraw: string; // wei
  dozValueInUsd: number;
  dozValueInEur?:number;
  dozValueInGbp?:number;
  
}

const AdminSchema = new Schema<IAdmin>(
  {
    _id: {
      type: String,
      default: "admin",
    },
    contractBalance: {
      type: String,
      default: "0",
    },

    minWithdraw: {
      type: String,
      default: "0",
    },
    dozValueInUsd: { type: Number, default: 5112.39 },
    dozValueInEur: { type: Number,  },
    dozValueInGbp: { type: Number,  },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const DozAdminModel = mongoose.model<IAdmin>("DozPool", AdminSchema);
