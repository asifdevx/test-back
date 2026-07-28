import { Schema, model } from 'mongoose';

// Stats schema for collections
const collectionStatsSchema = new Schema(
  {
    floorPrice: { type: Number, default: 0 },
    owners: { type: Number, default: 1 },
    items: { type: Number, default: 0 },
    totalVolume: { type: Number, default: 0 },

    // Time-based stats
    stats7d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats14d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats30d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats60d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats90d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    allTime: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    volumeChange24h: { type: Number, default: 0 },
    volumeChange7d: { type: Number, default: 0 },
  },
  { _id: false },
);

// History schema for charts
const historySchema = new Schema(
  {
    timestamp: Number,
    volume: Number,
    avgPrice: Number,
    sales: Number,
  },
  { _id: false },
);


const collectionSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true },
    royaltyFee: { type: Number, default: 0 },
    maxSupply: { type: Number, default: 0 },
    chainId: { type: Number, required: true },
    collectionAddress: { type: String, lowercase: true },
    contractType: { type: String, enum: ['ERC721', 'ERC1155'] },
    description: String,
    avatarUrl: String,
    bannerUrl: String,
    remainSupply: { type: Number, default: 0 },
    creatorAddress: { type: String, lowercase: true },

    stats: { type: collectionStatsSchema, default: () => ({}) },
    importedBy: { type: String, lowercase: true },
    volumeHistory: [historySchema],
    category: {
      type: String,
      enum: ['Art', 'Collectibles', 'Music', 'Photography', 'Gaming', 'Sports', 'Utility', 'Virtual Worlds'],
      index: true,
    },
    dailyStats: {
      type: Map,
      of: {
        sales: Number,
        volume: Number,
        avgPrice: Number,
      },
      default: {},
    },

    holders: {
      type: Map,
      of: Number,
      default: {},
    },

    links: {
      website: String,
      discord: String,
      twitter: String,
    },

    // Verified badge
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Optional: ensure unique collection name per creator
collectionSchema.index({ slug: 1, collectionAddress: 1, chainId: 1 }, { unique: true });
collectionSchema.index({ collectionAddress: 1, chainId: 1 });
collectionSchema.index({slug:1});
collectionSchema.index({ 'holders.$**': 1 });
collectionSchema.index({ creatorAddress: 1 });
export const Collection = model('Collection', collectionSchema);
