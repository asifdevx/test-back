import { Schema, model } from "mongoose";

const tokenStatsSchema = new Schema(
  {
    totalVolume: { type: Number, default: 0 }, // total ETH sold
    totalSales: { type: Number, default: 0 }, // total number of sales
    avgPrice: { type: Number, default: 0 }, // average sale price

    // Time-based stats
    stats7d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats14d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats30d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats60d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    stats90d: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
    allTime: { sales: { type: Number, default: 0 }, avgPrice: { type: Number, default: 0 }, volume: { type: Number, default: 0 } },
  },
  { _id: false },
);

const erc1155HolderSchema = new Schema(
  {
    holder: { type: String, lowercase: true },
    quantity: { type: Number, default: 0 },

    listing: {
      price: Number,
      quantity: Number,
      isListed: { type: Boolean, default: false },
      listedAt: Number,
    },

    auction: {
      _id: { type: Schema.Types.ObjectId, auto: true },
      minPrice: Number,
      highestBid: Number,
      highestBidder: String,
      endTime: Number,
      quantity: Number,
      isListed: { type: Boolean, default: false },
      claimed: Boolean,
      startedAt: Number,
      updatedAt: Number,
    },
  },
  { _id: true },
);

const tokenHistorySchema = new Schema(
  {
    timestamp: Number,
    price: Number,
    eventType: String,
    quantity: Number,
  },
  { _id: false },
);

const tokenSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractType: { type: String, enum: ["ERC721", "ERC1155"], required: true },
    contractAddress: { type: String, lowercase: true },
    tokenId: { type: Number, required: true },

    name: String,
    description: String,
    image: String,
    animation_url:String,
    attributes: Array,
    external_url: String,
    creator: { type: String, lowercase: true },
    seller: { type: String, lowercase: true },
    blockTimestamp: Number,

    supply: Number,
    stats: { type: tokenStatsSchema, default: () => ({}) },
    metadata: Schema.Types.Mixed,
    volumeHistory: [tokenHistorySchema],
    dailyStats: {
      type: Map,
      of: {
        sales: { type: Number, default: 0 },
        volume: { type: Number, default: 0 },
        avgPrice: { type: Number, default: 0 },
      },
      default: {},
    },
    events: [{ type: Schema.Types.ObjectId, ref: "Event" }],
    listing: {
      isListed: { type: Boolean, default: false },
      price: Number,
      quantity: Number,
      listedAt: Number,
    },
    erc1155Holders: {
      type: Map,
      of: erc1155HolderSchema,
      default: {},
    },
    auction: {
      minPrice: Number,
      highestBid: Number,
      highestBidder: String,
      endTime: Number,
      quantity: Number,
      isListed: { type: Boolean, default: false },
      claimed: Boolean,
      startedAt: Number,
      updatedAt: Number,
    },
    isStaked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

tokenSchema.index({ chainId: 1, tokenId: 1, contractType: 1, contractAddress: 1 }, { unique: true });
tokenSchema.index({ chainId: 1, contractAddress: 1 });
tokenSchema.index({ chainId: 1, contractAddress: 1, tokenId: -1 });
tokenSchema.index({ "listing.price": 1 });
tokenSchema.index({ createdAt: -1, _id: -1 });
tokenSchema.index({ "listing.listedAt": -1, _id: -1 });
tokenSchema.index({ "auction.isListed": 1 });
tokenSchema.index({ "attributes.trait_type": 1, "attributes.value": 1 });
tokenSchema.index({ "offers.buyer": 1 });
tokenSchema.index({ "offers.status": 1 });

export const Token = model("Token", tokenSchema);
