import { Request, Response } from "express";
import { Token } from "../schemas/sch.nft";

const SORT_MAP: Record<string, any> = {
  "recently-listed": { "listing.listedAt": -1, updatedAt: -1, _id: -1 },
  "recently-created": { createdAt: -1, _id: -1 },
  "recently-sold": { "stats.allTime.sales": -1, _id: -1 },
  "price-low-high": { effectivePrice: 1, _id: -1 },
  "price-high-low": { effectivePrice: -1, _id: -1 },
  "highest-last-sale": { "stats.allTime.avgPrice": -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 }, 
};

export const onSaleNfts = async (req: Request, res: Response) => {
  try {
    const { address, page = 1, limit = 20, sortBy = '', filters = {} }: any = req.query;

    if (!address) {
      return res.status(400).json({ message: 'Address is required' });
    }

    const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters || {};
    const wallet = address.toLowerCase();
    const skip = (Number(page) - 1) * Number(limit);

    /* ---------------- BASE QUERY ---------------- */
    const query: any = {
      $or: [
        // ERC721
        {
          contractType: 'ERC721',
          seller: wallet,
          $or: [{ 'listing.isListed': true }, { 'auction.isListed': true }],
        },

        // ERC1155
        {
          contractType: 'ERC1155',
          $or: [{ [`erc1155Holders.${wallet}.listing.isListed`]: true }, { [`erc1155Holders.${wallet}.auction.isListed`]: true }],
        },
      ],
    };

    /* ---------------- COLLECTION FILTER ---------------- */
    if (parsedFilters.collection) {
      query.contractAddress = parsedFilters.collection.toLowerCase();
    }

    /* ---------------- PRICE FILTER ---------------- */
    if (parsedFilters.minPrice || parsedFilters.maxPrice) {
      const priceFilter: any = {};
      if (parsedFilters.minPrice) priceFilter.$gte = Number(parsedFilters.minPrice);
      if (parsedFilters.maxPrice) priceFilter.$lte = Number(parsedFilters.maxPrice);

      query.$and = [
        {
          $or: [
            { 'listing.price': priceFilter },
            { 'auction.minPrice': priceFilter },
            { [`erc1155Holders.${wallet}.listing.price`]: priceFilter },
            { [`erc1155Holders.${wallet}.auction.minPrice`]: priceFilter },
          ],
        },
      ];
    }

    /* ---------------- AGGREGATION ---------------- */
    const pipeline: any[] = [
      { $match: query },

      // unified price for sorting
      {
        $addFields: {
          effectivePrice: {
            $cond: [
              { $eq: ['$contractType', 'ERC721'] },
              { $ifNull: ['$listing.price', '$auction.minPrice'] },
              {
                $ifNull: [`$erc1155Holders.${wallet}.listing.price`, `$erc1155Holders.${wallet}.auction.minPrice`],
              },
            ],
          },
        },
      },

      {
        $sort: SORT_MAP[sortBy] || { updatedAt: -1 },
      },

      { $skip: skip },
      { $limit: Number(limit) },
    ];

    const [items, totalCount] = await Promise.all([Token.aggregate(pipeline), Token.countDocuments(query)]);

   res.json({
     data: items,
     page: Number(page),
     total: totalCount,
     hasMore: skip + items.length < totalCount,
   });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch on-sale NFTs' });
  }
};


export const ownedNfts = async (req: Request, res: Response) => {
  try {
    const {
      address,
      page = 1,
      limit = 20,
      filters = "{}",
      sort = "",
    } = req.query;

    if (!address) {
      return res.status(400).json({ message: "Address is required" });
    }

    const userAddress = (address as string).toLowerCase();
    const skip = (Number(page) - 1) * Number(limit);
    const parsedFilters =
      typeof filters === "string" ? JSON.parse(filters) : filters || {};

    /* ---------------- BASE MATCH ---------------- */
    const match: any = {
      $or: [
        { seller: userAddress }, // ERC721
        { [`erc1155Holders.${userAddress}.quantity`]: { $gt: 0 } }, // ERC1155
      ],
    };

    if (parsedFilters.collection) {
      match.contractAddress = parsedFilters.collection.toLowerCase();
    }

    /* ---------------- SORT ---------------- */
   let sortStage: any = {};
switch (sort) {
  case "recently-listed":
    sortStage = { "listing.listedAt": -1, _id: -1 };
    break;
  case "recently-created":
    sortStage = { createdAt: -1, _id: -1 };
    break;
  case "price-low-high":
    sortStage = { "listing.price": 1, _id: 1 };
    break;
  case "price-high-low":
    sortStage = { "listing.price": -1, _id: -1 };
    break;
  default:
    sortStage = { createdAt: -1, _id: -1 };
}
    /* ---------------- AGGREGATION ---------------- */
    const pipeline: any[] = [
      { $match: match },

      /* ---------- Normalize seller wallet ---------- */
      {
        $addFields: {
          sellerWallet: {
            $cond: [
              { $eq: ["$contractType", "ERC721"] },
              "$seller",
              userAddress, // ERC1155 holder
            ],
          },
        },
      },

      /* ---------- Creator lookup ---------- */
      {
        $lookup: {
          from: "profiles",
          localField: "creator",
          foreignField: "address",
          as: "creator",
        },
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },

      /* ---------- Seller lookup ---------- */
      {
        $lookup: {
          from: "profiles",
          localField: "sellerWallet",
          foreignField: "address",
          as: "seller",
        },
      },
      { $unwind: { path: "$seller", preserveNullAndEmptyArrays: true } },

      /* ---------- Remove duplicate creator ---------- */
      {
        $addFields: {
          creator: {
            $cond: [
              {
                $or: [
                  { $eq: ["$creator.address", "$seller.address"] },
                  { $not: ["$creator.address"] },
                ],
              },
              "$$REMOVE",
              "$creator",
            ],
          },
        },
      },

      /* ---------- Sort & paginate ---------- */
      { $sort: sortStage },
      { $skip: skip },
      { $limit: Number(limit) },

      /* ---------- Final shape ---------- */
      {
        $project: {
          name: 1,
          image: 1,
          tokenId: 1,
          contractAddress: 1,
          contractType: 1,
          listing: 1,
          auction: 1,
          createdAt: 1,

          seller: {
            address: 1,
            displayName: 1,
            avatarUrl: 1,
            verified: 1,
          },

          creator: {
            address: 1,
            displayName: 1,
            avatarUrl: 1,
            verified: 1,
          },
        },
      },
    ];

    const [data, total] = await Promise.all([
      Token.aggregate(pipeline),
      Token.countDocuments(match),
    ]);

    res.json({
      data,
      page: Number(page),
      total,
      hasMore: skip + data.length < total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch owned NFTs" });
  }
};

export const createdNfts = async (req: Request, res: Response) => {
  try {
    const {address, page = 1, limit = 20, filters = '{}', sort = '' } = req.query;

    
    const skip = (Number(page) - 1) * Number(limit);
  
const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters || {};

   const userAddress = (address as string).toLowerCase();

    const query: any = { creator: userAddress };

    if (parsedFilters.collection) {
      query.contractAddress = parsedFilters.collection;
    }

    // Price filter for on-sale tokens
    if (parsedFilters.minPrice || parsedFilters.maxPrice) {
      const priceFilter: any = {};
      if (parsedFilters.minPrice) priceFilter.$gte = Number(parsedFilters.minPrice);
      if (parsedFilters.maxPrice) priceFilter.$lte = Number(parsedFilters.maxPrice);

      query.$or = [{ 'listing.price': priceFilter }, { 'auction.minPrice': priceFilter }];
    }

    let sortQuery: any = { createdAt: -1 };
    switch (sort) {
      case 'recently-listed':
        sortQuery = { 'listing.listedAt': -1 };
        break;
      case 'recently-created':
        sortQuery = { createdAt: -1 };
        break;
      case 'price-low-high':
        sortQuery = { 'listing.price': 1 };
        break;
    case 'price-high-low':
        sortQuery = { 'listing.price': -1 };
        break;
    }

    const data = await Token.find(query).sort(sortQuery).skip(skip).limit(Number(limit)).lean();

    const total = await Token.countDocuments(query);

    res.json({
      data,
      page: Number(page),
      total,
      hasMore: skip + data.length < total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch created NFTs' });
  }
};