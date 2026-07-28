import { Request, Response } from "express";
import { Event } from "../schemas/event.schema";
import { Favorite } from "../schemas/favorite.schema";
import { Profile } from "../schemas/sch.userProfile";

// !--------------- POST / favoritesexport

export const addFavorite = async (req: Request, res: Response) => {
  const { userAddress, targetType, targetId } = req.body;

  if (!userAddress || !targetType || !targetId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // 1. Create the Favorite
    const favorite = await Favorite.create([
      {
        userAddress: userAddress.toLowerCase(),
        targetType,
        targetId,
      },
    ]);

    const timestamp = Math.floor(Date.now() / 1000);
    const events: any[] = [];
    const lowerAddress = userAddress.toLowerCase();
    const profile = await Profile.findOne({ address: lowerAddress })
      .select("_id")

      .lean();

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    // 2. Build Activity Feed Logs
    if (targetType === "NFT") {
      events.push({
        entityType: "TOKEN", // [profile image here] {userAddress} loved
        tokenId: targetId,
        eventType: "LIKES",
        from: lowerAddress,
        blockTimestamp: timestamp,
        metadata: { userId: profile._id },
      });

      events.push({
        entityType: "USER", // [nft image here ] {useraddress} loved
        from: lowerAddress,
        userId: profile._id,
        eventType: "LIKES",
        blockTimestamp: timestamp,
        metadata: { tokenId: targetId },
      });
    }

    if (targetType === "COLLECTION") {
      events.push({
        entityType: "COLLECTION", // [profile image here] {userAddress} loved
        collectionId: targetId,
        eventType: "LIKES",
        from: lowerAddress,
        blockTimestamp: timestamp,
        metadata: { userId: profile._id },
      });

      events.push({
        entityType: "USER", // [col image here ] {useraddress} loved
        from: lowerAddress,
        eventType: "LIKES",
        userId: profile._id,

        blockTimestamp: timestamp,
        metadata: { collectionId: targetId },
      });
    }

    if (targetType === "PROFILE") {
      events.push({
        entityType: "USER",
        userId: targetId,
        eventType: "LIKES",
        from: lowerAddress,
        blockTimestamp: timestamp,
      });
    }

    // 3. Atomic Insert
    if (events.length > 0) {
      await Event.insertMany(events);
    }

    return res.status(201).json({ success: true, data: favorite[0] });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Already favorited" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

// !--------------- POST / favorites

export const removeFavorite = async (req: Request, res: Response) => {
  const { userAddress, targetType, targetId } = req.body;

  if (!userAddress || !targetType || !targetId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const user = userAddress.toLowerCase();

  try {
    // 1️⃣ Remove favorite
    const favorite = await Favorite.findOneAndDelete({ userAddress: user, targetType, targetId });

    if (!favorite) {
      return res.status(404).json({ message: "Favorite not found" });
    }

    // 2️⃣ Remove events (mirror addFavorite)
    const deleteOps: any[] = [];

    if (targetType === "NFT") {
      deleteOps.push(
        {
          deleteMany: {
            filter: {
              entityType: "TOKEN",
              tokenId: targetId,
              from: user,
              eventType: "LIKES",
            },
          },
        },
        {
          deleteMany: {
            filter: {
              entityType: "USER",
              from: user,
              eventType: "LIKES",
              "metadata.tokenId": targetId,
            },
          },
        },
      );
    }

    if (targetType === "COLLECTION") {
      deleteOps.push(
        {
          deleteMany: {
            filter: {
              entityType: "COLLECTION",
              collectionId: targetId,
              from: user,
              eventType: "LIKES",
            },
          },
        },
        {
          deleteMany: {
            filter: {
              entityType: "USER",
              from: user,
              eventType: "LIKES",
              "metadata.collectionId": targetId,
            },
          },
        },
      );
    }

    if (targetType === "PROFILE") {
      deleteOps.push({
        deleteMany: {
          filter: {
            entityType: "USER",
            userId: targetId,
            from: user,
            eventType: "LIKES",
          },
        },
      });
    }

    if (deleteOps.length) {
      await Event.bulkWrite(deleteOps);
    }

    return res.status(200).json({
      success: true,
      message: "Favorite removed successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to remove favorite" });
  } finally {
  }
};

// !--------------- GET / favorites / check

export const checkFavorite = async (req: Request, res: Response) => {
  try {
    const { userAddress, targetType, targetId } = req.query;

    if (!userAddress && typeof userAddress !== "string") {
      return res.json({ message: "requeri" });
    }

    const user = (userAddress as string).toLowerCase();

    const exists = await Favorite.exists({
      userAddress: user,
      targetType,
      targetId,
    });

    res.json({ isFavorited: !!exists });
  } catch (error) {
    res.status(500).json({ message: "Failed to check favorite" });
  }
};
// !--------------- GET / favorites / count

export const getFavoriteCount = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.query;

    const count = await Favorite.countDocuments({
      targetType,
      targetId,
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: "Failed to get count" });
  }
};
