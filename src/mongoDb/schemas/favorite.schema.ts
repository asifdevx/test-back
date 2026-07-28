
import { Schema, model } from 'mongoose';

const FavoriteSchema = new Schema(
  {
    userAddress: {
      type: String,
      lowercase: true,
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      enum: ['NFT', 'COLLECTION', 'PROFILE'],
      required: true,
      index: true,
    },

    targetId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

FavoriteSchema.index({ userAddress: 1, targetType: 1, targetId: 1 }, { unique: true });

FavoriteSchema.index({ targetType: 1, targetId: 1 });

export const Favorite = model('Favorite', FavoriteSchema);
