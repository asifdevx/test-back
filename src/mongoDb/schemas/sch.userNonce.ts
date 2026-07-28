import { Document, Schema, model } from "mongoose";

export interface ExtendedStakeNonceDocument extends Document {
  address: string;
  chainId:number;
  stakeNonce: number;
}

const StakeNonceSchema = new Schema<ExtendedStakeNonceDocument>({
  address:{ type: String, required: true,lowercase:true,index:true},
  chainId:{ type: Number, required: true, index:true},
  stakeNonce: { type: Number, required: true, default: 1 },
});
StakeNonceSchema.index({ address: 1, chainId: 1 }, { unique: true });
export const UserNonce = model<ExtendedStakeNonceDocument>("UserNonce", StakeNonceSchema);
