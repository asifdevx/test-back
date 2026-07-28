import { Request, Response } from "express";
import { Collection } from "../schemas/collection.schema";
import { Token } from "../schemas/sch.nft";

export const getCollection = async (req: Request, res: Response) => {
  try {
    const { search = '',  page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const filter: any = {};
    if (search) {
      filter.$or = [{ name: { $regex: search, $options: 'i' } }, { slug: { $regex: search, $options: 'i' } }];
    }
      
    const data = await Collection.find(filter)
      .sort({ "stats.allTime.volume": -1, _id: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    
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
    res.status(500).json({ message: 'Failed to fetch collections' });
  }
};

export const getCollectionStats7d = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);


    const stats = await Collection.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: '$contractType',
          count: { $sum: 1 },
        },
      },
    ]);

    // Count total new collections
    const totalNewCollections = await Collection.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
  
    
    res.status(200).json({
      totalNewCollections,
      erc721Created: stats.find((s) => s._id === 'ERC721')?.count || 0,
      erc1155Created: stats.find((s) => s._id === 'ERC1155')?.count || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch chart stats' });
  }
};

export const handleVerifyCollection = async (req: Request, res: Response) => {
  try {
    const { _id, isVerified } = req.body;

    if (!_id || typeof isVerified !== 'boolean') {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const updated = await Collection.findByIdAndUpdate(_id, { isVerified }, { new: true }).lean();

    if (!updated) return res.status(404).json({ error: 'Collection not found' });

    res.json({ success: true, isVerified: updated.isVerified });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


export const handleDeleteCollection = async (req: Request, res: Response) => {
  try {
    const { _id } = req.body;

    if (!_id)
      return res.status(400).json({ error: "Collection ID is required" });

   
    const collection = await Collection.findById(_id);
    if (!collection)
      return res.status(404).json({ error: "Collection not found" });

    
    const deleteResult = await Token.deleteMany({
      contractAddress: collection.collectionAddress,
      chainId: collection.chainId,
    
    });

    
    await Collection.findByIdAndDelete(_id);

    res.json({
      success: true,
      message: "Collection and related NFTs deleted successfully",
      deletedNFTs: deleteResult.deletedCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};