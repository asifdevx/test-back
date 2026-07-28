import axios from "axios";
import express, { Request, Response } from "express";
import { chainNativeTokensBySymbol, singleKey } from "../config/chainId";
import { Collection } from "../mongoDb/schemas/collection.schema";
import { Token } from "../mongoDb/schemas/sch.nft";
import { nftImportQueue } from "../redis/queues";

const router = express.Router();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchWithRetry = async (fetchFn: () => Promise<any>, retries = 3, delay = 2000) => {
  try {
    return await fetchFn();
  } catch (err: any) {
    if (err.response?.status === 429 && retries > 0) {
      console.warn(`Rate limited, retrying in ${delay}ms...`);
      await sleep(delay);
      return fetchWithRetry(fetchFn, retries - 1, delay * 2);
    }
    throw err;
  }
};
export const fetchCollectionData = async (req: Request, res: Response) => {
  try {
    const { contractAddress, chainId } = req.body;

    if (!contractAddress || !chainId) {
      return res.status(400).json({ success: false, message: "contractAddress and chainId are required" });
    }

    const base = chainNativeTokensBySymbol[chainId]?.name;
    if (!base) return res.status(400).json({ success: false, message: `Unsupported chainId ${chainId}` });

    const url = new URL(`https://${base}.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}/getNFTsForCollection`);

    url.searchParams.append("contractAddress", contractAddress);
    url.searchParams.append("withMetadata", "true");
    url.searchParams.append("limit", "1");

    const data = await fetchWithRetry(async () => {
      const res = await axios.get(url.toString());

      return res.data;
    });

    const collectionMetadata = data.nfts?.[0]?.contract || null;
    if (!collectionMetadata) {
      return res.status(404).json({ success: false, message: "Collection not found", collection: null });
    }

    // Check if collection already exists in DB
    const existing = await Collection.findOne({
      collectionAddress: contractAddress.toLowerCase(),
      chainId,
    });

    if (existing) {
      return res.status(200).json({
        success: false,
        message: "Collection already imported",
        collection: existing,
      });
    }

    const collectionObj = {
      name: collectionMetadata.name,
      slug: collectionMetadata.symbol,
      chainId,
      maxSupply: Number(collectionMetadata.totalSupply),
      collectionAddress: collectionMetadata.address.toLowerCase(),
      contractType: collectionMetadata.tokenType,
      description: collectionMetadata.openSeaMetadata?.description || "",
      avatarUrl: collectionMetadata.openSeaMetadata?.imageUrl || "",
    };

    return res.status(200).json({ success: true, message: "Collection fetched", collection: collectionObj });
  } catch (error: any) {
    console.error("fetchCollectionData error:", error.message || error);
    return res.status(500).json({ success: false, message: "Failed to fetch collection", error: error.message || error });
  }
};

export const importCollection = async (req: Request, res: Response) => {
  try {
    const {
      importedAddress,
      name,
      collectionAddress,
      slug,
      chainId,
      description,
      avatarUrl,
      bannerUrl,
      category,
      royaltyFee: sudoRoyalty,
      maxSupply: sudoMaxSupply,

      contractType,
    } = req.body;

    // Check required fields
    if (!avatarUrl || !bannerUrl || !name || !slug || !importedAddress || !chainId || !contractType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedSlug = String(slug).toLowerCase();
    const lowerCollectionAddress = String(collectionAddress).toLowerCase();

    // Check if collection already exists
    const existingCollection = await Collection.findOne({ slug: normalizedSlug, chainId: Number(chainId) });
    if (existingCollection) {
      return res.status(409).json({ success: false, message: "Collection already imported" });
    }

    // Create new collection document
    const newCollection = new Collection({
      name,
      slug: normalizedSlug,
      collectionAddress: lowerCollectionAddress,
      chainId: Number(chainId),
      description: description || "",
      avatarUrl,
      bannerUrl,
      category,
      royaltyFee: Number(sudoRoyalty) || 0,
      maxSupply: Number(sudoMaxSupply) || 0,
      remainSupply: Number(sudoMaxSupply) || 0,
      importedBy: String(importedAddress).toLowerCase(),
      contractType,
      stats: {},
      volumeHistory: [],
      dailyStats: {},
      holders: {},
      links: {},
      isVerified: false,
    });

    await newCollection.save();

    return res.status(201).json({ success: true, collection: newCollection });
  } catch (error) {
    console.error("Failed to import collection:", error);
    return res.status(500).json({ error: "Failed to import collection" });
  }
};

const importCollectionNfts = async (req: Request, res: Response) => {
  try {
    const { address, chainId, collectionAddress } = req.body;

    if (!chainId || !collectionAddress) {
      return res.status(400).json({ success: false, message: "Missing chainId or collectionAddress" });
    }
    const lowerCollectionAddress = collectionAddress.toLowerCase();

    const base = chainNativeTokensBySymbol[chainId].name;
    const url = new URL(`https://${base}.g.alchemy.com/nft/v3/${singleKey}/isHolderOfContract?wallet=${address}&contractAddress=${collectionAddress}`);

    const { data } = await axios.get(url.toString());
    const isHolder = data.isHolderOfContract;
    if (isHolder) {
      const latestToken = await Token.findOne({ chainId, contractAddress: lowerCollectionAddress }).sort({ tokenId: -1 });
      const startId = latestToken ? latestToken.tokenId + 1 : 1;
      await nftImportQueue.add(
        "import-collection",
        {
          base,
          chainId,
          collectionAddress: lowerCollectionAddress,
          startId: startId ? Number(startId) : 1,
        },
        {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
        },
      );
      return res.status(202).json({
        success: true,
        message: "Your NFTs will be updated within 30 minutes.",
      });
    } else {
      return res.status(202).json({
        success: true,
        message: "Your NFT does not belong to this collection.",
      });
    }
  } catch (error: any) {
    console.error("Failed to Import Nfts", error?.message);
    return res.status(500).json({ success: false, message: error?.message });
  }
};

router.post("/collectionPreview", fetchCollectionData);
router.post("/", importCollection);
router.post("/importNftsOnCollection", importCollectionNfts);
export default router;
