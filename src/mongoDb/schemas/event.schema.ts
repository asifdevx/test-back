import { Schema, model } from 'mongoose';

// Focused only on Marketplace and Transfer activity
export type EventType = 'TRANSFER' | 'LIST' | 'SALE' | 'BID' | 'LIKES';

const eventSchema = new Schema(
  {
    // 🔗 Identity

    entityType: {
      type: String,
      enum: ['TOKEN', 'COLLECTION', 'USER'],
      required: true,
      index: true,
    },

    tokenId: {
      type: Schema.Types.ObjectId,
      ref: 'Token',
      index: true,
      required: function () {
        return this.entityType === 'TOKEN';
      },
    },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      index: true,
      required: function () {
        return this.entityType === 'COLLECTION';
      },
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      index: true,
      required: function () {
        return this.entityType === 'USER';
      },
    },
    // 🏷️ Categorization
    eventType: {
      type: String,
      enum: ['TRANSFER', 'LIST', 'SALE', 'BID', 'LIKES'],
      index: true,
    },

    // 👥 Actors (Wallets)
    from: { type: String, lowercase: true, index: true }, // Seller / Bidder / Sender
    to: { type: String, lowercase: true, index: true }, // Buyer / Receiver

    // 💰 Financials
    price: { type: Number }, // The price in ETH/Currency
    chainId: { type: Number, default: 1 },
    quantity: { type: Number, default: 1 },

    // ⛓️ Blockchain Data
    txHash: { type: String, lowercase: true },
    blockTimestamp: { type: Number, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Optimized Compound Indexes
// 1. For the "Activity" tab on an NFT page
eventSchema.index({ tokenId: 1, blockTimestamp: -1 });

// 2. For "Global Activity" or "Collection Activity" feeds
eventSchema.index({ collectionId: 1, blockTimestamp: -1 });

export const Event = model('Event', eventSchema);
