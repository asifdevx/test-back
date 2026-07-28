import express, { Request, Response } from "express";
import {
  extraVolume,
  fixedNftDetails,
  getCollectionNFTs,
  getNftsById,
  getSingleNftsDetails,
  getTopAuctionNFTs,
  handleBatchList,
  handleBatchUnlistNFTs,
  handleSinglelistNFT,
  handleSingleUnlistNFT,
} from "../mongoDb/controllers/c.nft";

import {
  createdNfts,
  onSaleNfts,
  ownedNfts,
} from "../mongoDb/controllers/c.profile-nfts";
import { Collection } from "../mongoDb/schemas/collection.schema";
import { Token } from "../mongoDb/schemas/sch.nft";
import { Profile } from "../mongoDb/schemas/sch.userProfile";
const walletRouter = express.Router();

walletRouter.get("/getRecentNft", async (req: Request, res: Response) => {
  try {
    const recentNFTs = await Token.find({
      creator: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .limit(15)
      .select("tokenId name image contractAddress chainId creator");

    // -------------------------
    // Creators
    // -------------------------
    const creatorAddresses = [...new Set(recentNFTs.map((nft) => nft.creator))];

    const profiles = await Profile.find({
      address: { $in: creatorAddresses },
    }).select("address displayName avatarUrl");

    const profileMap = profiles.reduce((acc: any, p) => {
      acc[p.address] = p;
      return acc;
    }, {});

    // -------------------------
    // Collections
    // -------------------------
    const collectionKeys = recentNFTs.map((nft) => ({
      collectionAddress: nft.contractAddress?.toLowerCase(),
      chainId: nft.chainId,
    }));

    const collections = await Collection.find({
      $or: collectionKeys,
    }).select("collectionAddress chainId avatarUrl name slug");

    const collectionMap = collections.reduce((acc: any, c) => {
      acc[`${c.chainId}:${c.collectionAddress}`] = c;
      return acc;
    }, {});

    // -------------------------
    // Enrich NFTs
    // -------------------------
    const enrichedNFTs = recentNFTs.map((nft) => {
      const collectionKey = `${
        nft.chainId
      }:${nft.contractAddress?.toLowerCase()}`;
      const collection = collectionMap[collectionKey];

      return {
        ...nft.toObject(),

        creator: profileMap[nft?.creator!] || {
          address: nft.creator,
          displayName: null,
          avatarUrl: null,
        },

        collection: collection
          ? {
              avatarUrl: collection.avatarUrl,
            }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      data: enrichedNFTs,
    });
  } catch (error: any) {
    console.error("Error fetching recent NFTs:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

walletRouter.get("/", async (req: Request, res: Response) => {
  const { q } = req.query;

  if (!q || typeof q !== "string") {
    return res.status(400).json({ message: "Query is required" });
  }

  const regex = new RegExp(q, "i");

  const [nfts, collections, users] = await Promise.all([
    Token.find({ name: regex })
      .limit(5)
      .select("name image tokenId chainId contractAddress")
      .lean(),
    Collection.find({ name: regex })
      .limit(5)
      .select("name avatarUrl slug")
      .lean(),
    Profile.find({ displayName: regex })
      .limit(5)
      .select("displayName avatarUrl address")
      .lean(),
  ]);

  res.json({
    success: true,
    data: {
      nfts,
      collections,
      users,
    },
  });
});
walletRouter.get("/onSale", onSaleNfts);
walletRouter.get("/owned", ownedNfts);
walletRouter.get("/created", createdNfts);
walletRouter.get("/filter-collection-nft", getCollectionNFTs);
walletRouter.post("/by-ids", getNftsById);
walletRouter.post("/listFixed", handleBatchList);
walletRouter.post("/unListFixed", handleBatchUnlistNFTs);
walletRouter.post("/listSingleNft", handleSinglelistNFT);
walletRouter.post("/unListSingleNft", handleSingleUnlistNFT);
//! -------------- nft page
walletRouter.get("/nft-detail", getSingleNftsDetails);
walletRouter.post("/fixed-nft-data", fixedNftDetails);
walletRouter.get("/top-auction-nfts", getTopAuctionNFTs);
walletRouter.post("/after-transfer-increase-volumn", extraVolume);
export default walletRouter;
