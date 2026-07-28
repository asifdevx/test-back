import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Collection } from '../schemas/collection.schema';
import { Event } from '../schemas/event.schema';
import { Bid } from '../schemas/s.bid';
import { Token } from '../schemas/sch.nft';
import { Profile } from '../schemas/sch.userProfile';

export const getUserBid = async (req: Request, res: Response) => {
  const { id, sellerAddress, userAddress } = req.query;

  if (!id || !userAddress) {
    return res.status(400).json({ error: 'Missing id or userAddress' });
  }

  try {
    const token = await Token.findById(id);
    if (!token) return res.status(404).json({ error: 'Token not found' });

    const userAddr = (userAddress as string).toLowerCase();

    if (token.contractType === 'ERC1155') {
      if (!sellerAddress) return res.status(400).json({ error: 'Missing sellerAddress for ERC1155' });
      const holder = token.erc1155Holders.get((sellerAddress as string).toLowerCase());
      if (!holder || !holder.auction || !holder.auction.isListed) {
        return res.status(400).json({ error: 'No active auction for this holder' });
      }

      const existingBid = await Bid.findOne({ auctionRef: holder.auction._id, bidder: userAddr });
      return res.json({ bid: existingBid || null });
    }

    if (token.contractType === 'ERC721') {
      if (!token.auction || !token.auction.isListed) return res.status(400).json({ error: 'No active auction for this token' });

      const existingBid = await Bid.findOne({ auctionRef: token._id, bidder: userAddr });
      return res.json({ bid: existingBid || null });
    }

    return res.status(400).json({ error: 'Unsupported contract type' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const handlePlaceBid = async (req: Request, res: Response) => {
  const { id, bidAmount, sellerAddress, userAddress, quantity = 1 } = req.body;

  if (!id || !bidAmount || !userAddress || !sellerAddress) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const lowerUser = userAddress.toLowerCase();
  const holderAddr = sellerAddress.toLowerCase();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ----------------------------- Fetch Data ----------------------------- */
    /* 1. Parallel Data Fetching (Speed Boost 🚀) */
    const [token, bidderProfile] = await Promise.all([
      Token.findById(id).session(session),
      Profile.findOne({ address: lowerUser }, { _id: 1 })
        .session(session)
        .lean(),
    ]);

    if (!token) throw new Error("Token not found");
    if (!bidderProfile) throw new Error("Bidder profile not found");

    // Fetch collection info (only need ID)
    const collection = await Collection.findOne({
      collectionAddress: token.contractAddress,
    })
      .select("_id")
      .session(session)
      .lean();

    let bidRecord;
    let auction;
    let perTokenBid = bidAmount;

    /* ----------------------------- ERC1155 ----------------------------- */

    if (token.contractType === "ERC1155") {
      const holder = token.erc1155Holders.get(holderAddr);
      if (!holder) throw new Error("Holder not found");

      auction = holder.auction;
      if (!auction?.isListed) throw new Error("No active auction");

      perTokenBid = bidAmount / Number(quantity);
      const priceToBeat =
        auction.highestBid && auction.highestBid > 0
          ? auction.highestBid
          : auction.minPrice ?? 0;

      if (perTokenBid <= priceToBeat) {
        throw new Error(`Bid must be higher than ${priceToBeat}`);
      }

      bidRecord = await Bid.findOne({
        auctionRef: auction._id,
        bidder: lowerUser,
      }).session(session);

      if (bidRecord) {
        // 🔁 REBID
        bidRecord.amount = perTokenBid;
        await bidRecord.save({ session });
      } else {
        // 🆕 FIRST BID
        bidRecord = await Bid.create(
          [
            {
              contractType: "ERC1155",
              bidder: lowerUser,
              amount: perTokenBid,
              auctionRef: auction._id,
            },
          ],
          { session }
        );
        bidRecord = bidRecord[0];
      }

      auction.highestBid = perTokenBid;
      auction.highestBidder = lowerUser;

      await token.save({ session });
    }

    /* ----------------------------- ERC721 ----------------------------- */

    if (token.contractType === "ERC721") {
      auction = token.auction;
      if (!auction?.isListed) throw new Error("No active auction");

      const priceToBeat =
        auction.highestBid && auction.highestBid > 0
          ? auction.highestBid
          : auction.minPrice ?? 0;

      if (bidAmount <= priceToBeat) {
        throw new Error(`Bid must be higher than ${priceToBeat}`);
      }

      bidRecord = await Bid.findOne({
        auctionRef: token._id,
        bidder: lowerUser,
      }).session(session);

      if (bidRecord) {
        bidRecord.amount = bidAmount;
        await bidRecord.save({ session });
      } else {
        bidRecord = await Bid.create(
          [
            {
              contractType: "ERC721",
              bidder: lowerUser,
              amount: bidAmount,
              auctionRef: token._id,
            },
          ],
          { session }
        );
        bidRecord = bidRecord[0];
      }

      auction.highestBid = bidAmount;
      auction.highestBidder = lowerUser;

      await token.save({ session });
    }

    /* ----------------------------- EVENTS (AFTER SUCCESS) ----------------------------- */

    const timestamp = Math.floor(Date.now() / 1000);
    const commonEventData = {
      from: lowerUser,
      to: holderAddr,
      price: bidAmount,
      quantity,
      chainId: token.chainId,
      blockTimestamp: timestamp,
      eventType: "BID",
    };

    await Event.insertMany(
      [
        {
          ...commonEventData,
          entityType: "USER",
          userId: bidderProfile._id,
          metadata: { tokenId: token._id },
        },
        {
          ...commonEventData,
          entityType: "TOKEN",
          tokenId: token._id,
          metadata: { userId: bidderProfile._id },
        },
        {
          ...commonEventData,
          entityType: "COLLECTION",
          collectionId: collection?._id,
          metadata: { tokenId: token._id },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.json({
      message: bidRecord
        ? "Bid updated successfully"
        : "Bid placed successfully",
      bid: bidRecord,
    });
  } catch (err: any) {
    await session.abortTransaction();
    return res
      .status(400)
      .json({ error: err.message || "Internal server error" });
  } finally {
    session.endSession();
  }
};