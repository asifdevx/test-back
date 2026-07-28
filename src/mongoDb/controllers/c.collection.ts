import { Request, Response } from "express";
import { Collection } from "../schemas/collection.schema";
import { Token } from "../schemas/sch.nft";

//! update ---- this function update backend collection creation
export const updateCollection = async (req: Request, res: Response) => {
  const { creatorAddress, name, slug, chainId, description, avatarUrl, bannerUrl, category,collectionAddress } = req.body;

  if (!avatarUrl || !bannerUrl || !name || !slug || !creatorAddress || !chainId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const normalizedSlug = String(slug).toLowerCase();

  try {
    let data = await Collection.findOne({
      slug: normalizedSlug,
      chainId: Number(chainId),
    });

    // ✅ If not found → create new
    if (!data) {
      data = new Collection({
        creatorAddress: String(creatorAddress).toLowerCase(),
        name,
        slug: normalizedSlug,
        chainId: Number(chainId),
        description: description || "",
        avatarUrl,
        bannerUrl,
        category,
        collectionAddress,
      });

      await data.save();

      return res.status(201).json(data);
    }

    // ✅ If exists → update
    data.creatorAddress = String(creatorAddress).toLowerCase();
    data.name = name;
    data.slug = normalizedSlug;
    data.chainId = Number(chainId);
    data.description = description || "";
    data.avatarUrl = avatarUrl;
    data.bannerUrl = bannerUrl;
    data.category = category;

    await data.save();

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Failed to upsert collection" });
  }
};
//! check ---- this function check wheather this slug already exist or not
export const handleSlugExists = async (req: Request, res: Response) => {
  const { slug } = req.query;
  if (!slug) {
    return res.status(400).json({ error: "Missing query parameters" });
  }

  try {
    const existingCollection = await Collection.findOne({
      slug: (slug as string).toLowerCase(),
    });
    if (existingCollection) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ! Get ---- get user collection
export const userCollection = async (req: Request, res: Response) => {
  const address  = req.params.address as  string;
  const lowerAddr = address?.toLowerCase();

  try {
    const collections = await Collection.find({
      $or: [
        { creatorAddress: lowerAddr }, // User is creator
        { importedBy: lowerAddr },
        { [`holders.${lowerAddr}`]: { $exists: true } }, // User holds some NFTs in this collection
      ],
    }).select("-tokens"); // exclude tokens if needed

    return res.status(200).json(collections);
  } catch (error) {
    console.error("Error fetching collections:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
// ! Get ---- When search on explore collection show

export const searchCollection = async (req: Request, res: Response) => {
  const { slug, page = 1, limit = 10 } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);

    const data = await Collection.find({
      $or: [{ slug: { $regex: slug, $options: "i" } }, { name: { $regex: slug, $options: "i" } }],
    })
      .sort({ maxSupply: -1 })
      .skip(skip)
      .limit(Number(limit));

    if (data.length === 0) {
      return res.status(200).json({ data: [], nextPage: null, message: "No collections found." });
    }
    const hasMore = data.length === Number(limit);
    res.status(200).json({ data, nextPage: hasMore ? Number(page) + 1 : null });
  } catch (error) {
    console.error("Explore Collection Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const exploreCollection = async (req: Request, res: Response) => {
  try {
    const { search = "", chains, minPrice, maxPrice, category, sortBy = "volume", page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const filter: any = {};
    if (search) {
      filter.$or = [{ name: { $regex: search, $options: "i" } }, { slug: { $regex: search, $options: "i" } }];
    }
    if (category) {
      filter.category = category;
    }
    if (chains) {
      filter.chainId = { $in: String(chains).split(",").map(Number) };
    }

    const floorPriceFilter: any = {};
    const min = Number(minPrice);
    const max = Number(maxPrice);

    if (!isNaN(min) && min > 0) floorPriceFilter.$gte = min;
    if (!isNaN(max) && max > 0) floorPriceFilter.$lte = max;

    if (Object.keys(floorPriceFilter).length > 0) {
      filter["stats.floorPrice"] = floorPriceFilter;
    }
    const sortMap: Record<string, any> = {
      "recently-listed": { createdAt: -1 },
      "recently-created": { createdAt: -1 },

      "recently-sold": { "stats.allTime.sales": -1 },

      "price-low-high": { "stats.floorPrice": 1 },
      "price-high-low": { "stats.floorPrice": -1 },

      "highest-last-sale": { "stats.allTime.avgPrice": -1 },
      oldest: { createdAt: 1 },

      volume: { "stats.allTime.volume": -1 },
    };
    const sort = typeof sortBy === "string" && sortMap[sortBy] ? sortMap[sortBy] : { createdAt: -1 };
    const data = await Collection.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean();

    const total = await Collection.countDocuments(filter);
    res.status(200).json({
      data,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        hasMore: skip + data.length < total,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch collections" });
  }
};

// TODO: Get single collection profile by slug
// @route   GET /api/collection?slug=:slug
// @access  Public

export const getCollectionProfileData = async (req: Request, res: Response) => {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: "Missing query parameters" });
  }
  try {
    const collection = await Collection.findOne({
      slug: (slug as string).toLowerCase(),
    });
    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    return res.status(200).json(collection);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const featureCollection = async (req: Request, res: Response) => {
  const collections = await Collection.find({})
    .limit(10)
    .select("name collectionAddress slug avatarUrl chainId stats.items creatorAddress") // select only necessary fields
    .lean();

  // Step 2: For each collection, fetch 3 tokens
  const collectionsWithTokens = await Promise.all(
    collections.map(async (col) => {
      const tokens = await Token.find({
        contractAddress: col.collectionAddress,
        chainId: col.chainId,
      })
        .limit(3)
        .select("chainId image tokenId ") // select only required fields
        .lean();

      return {
        ...col,
        tokens,
      };
    }),
  );

  res.json(collectionsWithTokens);
};

export const getCollectionFilters = async (req: Request, res: Response) => {
  const { chainId, contractAddress } = req.query;

  try {
    const match = {
      chainId: Number(chainId),
      contractAddress: String(contractAddress).toLowerCase(),
    };

    const traits = await Token.aggregate([
      { $match: match },
      { $unwind: "$attributes" },
      {
        $group: {
          _id: {
            trait: "$attributes.trait_type",
            value: "$attributes.value",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.trait",
          values: {
            $push: {
              value: "$_id.value",
              count: "$count",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          trait: "$_id",
          values: 1,
        },
      },
    ]);
    res.status(200).json(traits);
  } catch (error) {
    console.error("getCollectionFilters error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const batchSelectNftFromCollection = async (req: Request, res: Response) => {
  const contractAddress  = req.params.contractAddress as string;
  const { limit, filters, sort, chainId, address } = req.body;

  try {
    const lowerAddress = address?.toLowerCase();
    const query: any = {
      contractAddress: contractAddress.toLowerCase(),
      chainId,
      contractType: "ERC721", // ONLY ERC721
      "auction.isListed": { $ne: true },
    };

    // ---- USER FILTER ----
    if (lowerAddress) {
      query.$or = [
        { seller: lowerAddress }, // own NFTs
        {
          $and: [
            { seller: { $ne: lowerAddress } }, // others
            {
              $or: [{ "listing.isListed": true }],
            },
          ],
        },
      ];
    }

    // ---- TRAIT FILTER ----
    if (filters?.traits && Object.keys(filters.traits).length > 0) {
      const traitConditions = Object.entries(filters.traits)
        .filter(([_, values]) => Array.isArray(values) && values.length > 0)
        .map(([trait, values]) => ({
          attributes: {
            $elemMatch: { trait_type: trait, value: { $in: values } },
          },
        }));

      if (traitConditions.length > 0) {
        query.$and = query.$and ? query.$and.concat(traitConditions) : traitConditions;
      }
    }

    if (filters?.saleType) {
      switch (filters.saleType) {
        case "fixed":
          query.$and = [...(query.$and || []), { "listing.isListed": true }, { "auction.isListed": false }];
          break;

        case "auction":
          query.$and = [...(query.$and || []), { "auction.isListed": true }];
          break;

        case "not_for_sale":
          query.$and = [...(query.$and || []), { "listing.isListed": false }, { "auction.isListed": false }];
          break;
      }
    }
    // ---- PRICE FILTER ----
    if (filters?.price?.min != null || filters?.price?.max != null) {
      query["listing.price"] = {};
      if (filters.price.min != null) query["listing.price"].$gte = Number(filters.price.min);
      if (filters.price.max != null) query["listing.price"].$lte = Number(filters.price.max);
    }

    // ---- LIMIT & SORT ----
    const safeLimit = Math.min(Number(limit) || 20, 500);
    const sortMap: Record<string, any> = {
      "recently-listed": { createdAt: -1, _id: -1 },
      "recently-created": { blockTimestamp: -1, _id: -1 },
      "price-low-high": { "listing.price": 1, _id: 1 },
      "price-high-low": { "listing.price": -1, _id: -1 },
      oldest: { createdAt: 1, _id: 1 },
    };
    const sortQuery = sortMap[sort as string] || { createdAt: -1, _id: -1 };

    // ---- QUERY ----
    const [tokens, count] = await Promise.all([Token.find(query).sort(sortQuery).limit(safeLimit).select("_id"), Token.countDocuments(query)]);

    res.status(200).json({
      count,
      ids: tokens.map((t) => t._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const changeCollectionBannerAndAvatar = async (req: Request, res: Response) => {
  try {
    const { id, avatarUrl, bannerUrl } = req.body;

    // ✅ Basic validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Collection id is required",
      });
    }

    if (!avatarUrl && !bannerUrl) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update",
      });
    }

    // ✅ Update only provided fields
    const updateData: Record<string, string> = {};
    if (avatarUrl) updateData.avatarUrl = avatarUrl;
    if (bannerUrl) updateData.bannerUrl = bannerUrl;

    const collection = await Collection.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true }, // return updated document
    );

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "Collection not found",
      });
    }

    // ✅ Success response
    return res.status(200).json({
      success: true,
      message: "Collection updated successfully",
      data: collection,
    });
  } catch (error) {
    console.error("changeCollectionBannerAndAvatar error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
