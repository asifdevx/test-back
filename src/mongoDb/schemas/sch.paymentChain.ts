import { Document, model, Schema } from "mongoose";

export interface IToken {
  name: string;
  symbol: string;
  contractAddress: string;
  decimals: number;
  imgUrl: string;
  isActive: boolean;
}

export interface IChain extends Document {
  chainId: number;
  tokens: IToken[];
  isActive: boolean;
}

const TokenSchema = new Schema<IToken>(
  {
    name: { type: String, required: true },
    symbol: { type: String, required: true },

    contractAddress: { type: String, required: true, lowercase: true },
    decimals: { type: Number, required: true, default: 18 },
    imgUrl: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const ChainSchema = new Schema<IChain>(
  {
    chainId: { type: Number, required: true, unique: true },

    tokens: { type: [TokenSchema], default: [] },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Chain = model<IChain>("Chain", ChainSchema);
