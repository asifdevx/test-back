import { Collection } from "../mongoDb/schemas/collection.schema";
import { Payload } from "../types";
export async function handleCollectionCreated({ chainId, type, event }: Payload) {
  try {
    const { creator, collectionAddress, name, slug: sudoSlug, royaltyFee: sudoRoyality, maxSupply: sudoMaxSupply } = event.args;

    const slug = String(sudoSlug).toLowerCase();
    const lowerCreator = String(creator).toLowerCase();
    const lowerCollectionAddress = String(collectionAddress).toLowerCase();

    const royaltyFee = Number(sudoRoyality);
    const maxSupply = Number(sudoMaxSupply);
 
    
    const colType = type === "ERC721FACTORY" ? "ERC721" : "ERC1155";
   
    
  await Collection.updateOne(
    { slug, chainId },
    {
      $set: {
        name,
        royaltyFee,
        maxSupply,
        contractType: colType,
        remainSupply: maxSupply,
        // Update the specific key in the holders Map
        [`holders.${lowerCreator}`]: 0,
      },
      $setOnInsert: {
        creatorAddress: lowerCreator,
        collectionAddress: lowerCollectionAddress,
        isVerified: false,
        // Initialize stats object to avoid null/undefined errors later
        stats: {
          items: 0,
          owners: 1, // The creator is the first owner
          floorPrice: 0,
          volume: 0,
        },
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  } catch (err) {
    console.error("Factory processor error:", err);
    throw err;
  }
}
