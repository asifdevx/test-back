//transformalchemy.ts
import axios from "axios";
import { chainNativeTokensBySymbol, singleKey } from "../config/chainId";
import { IPFS_GATEWAYS } from "./fallBackIpfs";

export const ipfsToGateway = (uri: string | null): string | null => {
  if (!uri) return null;

  if (uri.startsWith("ipfs://")) {
    const cidPath = uri.replace("ipfs://", "");
    return `${IPFS_GATEWAYS[0]}/${cidPath}`;
  }
  return uri;
};
export const fetchIpfsWithFallback = async (uri: string) => {
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = uri.startsWith("ipfs://") ? `${gateway}/${uri.replace("ipfs://", "")}` : uri;
      const res = await axios.get(url, { timeout: 5000 });
      if (res?.data) return res.data;
    } catch (e) {
      console.warn(`Failed to fetch from gateway ${gateway}, trying next...`);
    }
  }
  console.error("All IPFS gateways failed for:", uri);
  return null;
};

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

export function transformAlchemyCollection({
  raw,
  chainId,
}: {
  raw: any; // full Alchemy response
  chainId: number;
}) {
  if (!raw?.nfts?.length) return null;

  const contract = raw.nfts[0].contract;

  return {
    contractAddress: contract.address.toLowerCase(),
    name: contract.name || null,
    symbol: contract.symbol || null,
    tokenType: contract.tokenType || "ERC721",
    chainId,

    totalSupply: Number(contract.totalSupply || 0),

    floorPrice: contract.openSeaMetadata?.floorPrice ?? null,
    description: contract.openSeaMetadata?.description ?? null,
    image: contract.openSeaMetadata?.imageUrl ?? null,
    banner: contract.openSeaMetadata?.bannerImageUrl ?? null,
    externalUrl: contract.openSeaMetadata?.externalUrl ?? null,

    isSpam: contract.isSpam ?? false,

    fetchedAt: new Date(),
  };
}

export function transformAlchemyNFT({ raw, chainId, owner }: { raw: any; chainId: number; owner: string }) {
  const contractAddress = raw.contract?.address?.toLowerCase();
  if (!contractAddress || raw.tokenId == null) return null;

  const contractType = raw.contract?.tokenType || raw.tokenType;
  if (!contractType) return null;

  const tokenId = Number(raw.tokenId); // ✅ FIXED

  const metadata = raw.tokenUri?.rawMetadata ?? raw.metadata ?? raw.raw?.metadata ?? {};
  const image = raw.image?.cachedUrl || ipfsToGateway(metadata?.image) || ipfsToGateway(metadata?.image_url) || ipfsToGateway(metadata?.imageUrl) || "";

  const supply = contractType === "ERC1155" ? Number(raw.balance || 1) : 1;

  return {
    chainId,
    contractType, // ✅ REQUIRED
    contractAddress,
    tokenId, // ✅ NUMBER
    name: raw.name || metadata?.name || null,
    description: raw.description || metadata?.description || null,
    image,
    attributes: metadata?.attributes || [],
    external_url: metadata?.externalLink || null,

    creator: raw.contract?.contractDeployer?.toLowerCase() || null,
    seller: owner?.toLowerCase(),

    supply,
    metadata,

    blockTimestamp: raw.mint?.timestamp ? new Date(raw.mint.timestamp).getTime() : null,
  };
}
export const fetchOwnerNFTsForChain = async ({ owner, chainId, pageKey = null, pageSize = 100 }: { owner: string; chainId: number; pageKey: string | null; pageSize: number }) => {
  const base = chainNativeTokensBySymbol[chainId].name;
  const apiKey = singleKey;
  const url = new URL(`https://${base}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner`);
  url.searchParams.append("owner", owner);
  url.searchParams.set("withMetadata", "true");

  url.searchParams.set("tokenUriTimeoutInMs", "0");
  url.searchParams.append("pageSize", pageSize.toString());
  if (pageKey) {
    url.searchParams.append("pageKey", pageKey);
  }

  const data = await fetchWithRetry(async () => {
    const res = await axios.get(url.toString());
    return res.data;
  });

  return {
    ownedNfts: data.ownedNfts ?? [],
    pageKey: data.pageKey ?? null,
    totalCount: data.totalCount ?? 0,
  };
};

export const fixedAlchemyData = async ({ chainId, contractAddress, tokenId }: { chainId: number; contractAddress: string; tokenId: number }) => {
  const base = chainNativeTokensBySymbol[chainId].name;
  const apiKey = singleKey;

  const url = new URL(`https://${base}.g.alchemy.com/nft/v3/${apiKey}/getNFTMetadata`);
  url.searchParams.set("contractAddress", contractAddress);
  url.searchParams.set("tokenId", tokenId.toString());
  url.searchParams.set("refreshCache", "false");

  const data = await fetchWithRetry(async () => {
    const res = await axios.get(url.toString());
    return res.data;
  });

  // 🔹 Real metadata location
  const rawMetadata = data?.raw?.metadata ?? {};

  const updateData = {
    name: rawMetadata.name || data.name || "",
    description: rawMetadata.description || data.description || "",
    attributes: rawMetadata.attributes || [],
    metadata: rawMetadata,

    // 🔹 image priority: cached → raw ipfs → original
    image: ipfsToGateway(data?.image?.cachedUrl) || ipfsToGateway(rawMetadata.image) || ipfsToGateway(data?.image?.originalUrl) || null,

    tokenId: data.tokenId,
    contractAddress: data.contract?.address,
    collection: {
      name: data.collection?.name,
      slug: data.collection?.slug,
      image: data.contract?.openSeaMetadata?.imageUrl,
    },
    mint: data.mint ?? null,
    updatedAt: data.timeLastUpdated,
  };

  return updateData;
};
