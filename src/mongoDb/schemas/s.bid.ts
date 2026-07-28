import { Schema, model } from 'mongoose';

const bidSchema = new Schema(
  {
    contractType: {
      type: String,
      enum: ['ERC721', 'ERC1155'],
      required: true,
    },

    bidder: {
      type: String,
      lowercase: true,
      default: null,
      index: true,
    },

    amount: {
      type: Number,
      default: 0,
    },

    auctionRef: {
      type: Schema.Types.ObjectId,

      index: true,
    },
  },
  { timestamps: true },
);
bidSchema.index({ auctionRef: 1, amount: -1 });
bidSchema.index({ token: 1, createdAt: -1 });
bidSchema.index({ bidder: 1, createdAt: -1 });
bidSchema.index({ status: 1 });

export const Bid = model('bid', bidSchema);
