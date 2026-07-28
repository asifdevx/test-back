import { Request, Response } from "express";
import { Token } from "../schemas/sch.nft";

import mongoose from "mongoose";
import { Event } from '../schemas/event.schema';
import { Profile } from '../schemas/sch.userProfile';


export const getEvents = async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "20",
      search,
      currentPage,
      category,
      id,
    } = req.query;

    if (!currentPage || !id) {
      return res
        .status(400)
        .json({ success: false, message: "Missing currentPage or id" });
    }
 
    
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    const objectId = new mongoose.Types.ObjectId(id as string);

    // 1. Build Base Filter
    // We filter by entityType so we only see events relevant to the current view
    const query: any = { entityType: currentPage };

    if (currentPage === "TOKEN") query.tokenId = objectId;
    else if (currentPage === "COLLECTION") query.collectionId = objectId;
    else if (currentPage === "USER") query.userId = objectId;

    // 2. Filter by Category
    if (category && category !== "ALL") {
      query.eventType = category;
    }

   
    if (search) {
      const regex = new RegExp(search as string, "i");
      if (currentPage === "USER") {
        const tokens = await Token.find({ name: regex }).select("_id");
        query["metadata.tokenId"] = { $in: tokens.map((t) => t._id) };
      } else {
        const users = await Profile.find({ displayName: regex }).select("_id");
        query["metadata.userId"] = { $in: users.map((u) => u._id) };
      }
    }

    // 4. Execute with Deep Population
    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ blockTimestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        // Populate standard fields
        .populate("userId", "displayName avatarUrl")
        .populate("tokenId", "name avatarUrl")
        .populate("collectionId", "name avatarUrl")

        .populate({
          path: "metadata.userId",
          model: "Profile",
          select: "displayName avatarUrl",
        })
        .populate({
          path: "metadata.tokenId",
          model: "Token",
          select: "name image",
        })
        .populate({
          path: "metadata.collectionId",
          model: "Collection",
          select: "name avatarUrl",
        }),

      Event.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: events,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        nextPage: skip + events.length < total ? pageNum + 1 : null,
      },
    });
  } catch (error) {
    console.error("getEvents error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch events" });
  }
};