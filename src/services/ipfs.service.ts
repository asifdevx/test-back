import axios from "axios";
import { IPFS_GATEWAYS } from "../utils/fallBackIpfs";

const resolveIpfsUrl = (uri: string, gateway: string) => {
  if (uri.startsWith("ipfs://")) {
    return `${gateway}/${uri.replace("ipfs://", "")}`;
  }
  return uri;
};

export const EMPTY_METADATA = {
  name: "",
  description: "",
  image: "",
  attributes: [] as unknown[],
  external_url: "",
  animation_url: "",
};

export const fetchMetadata = async (tokenURI: string) => {
  if (!tokenURI) return EMPTY_METADATA;

  const cid = tokenURI.replace("ipfs://", "");

  for (const gateway of IPFS_GATEWAYS) {
    try {
      const metadataUrl = `${gateway}/${cid}`;

      const { data } = await axios.get(metadataUrl, { timeout: 5000 });

      const image = data.image ? resolveIpfsUrl(data.image, gateway) : "";
      const animation_url = data.animation_url ? resolveIpfsUrl(data.animation_url, gateway) : "";

      return {
        name: data.name || "",
        description: data.description || "No description available",
        image,
        attributes: data.attributes || [],
        external_url: data.external_url || "",
        animation_url,
      };
    } catch (err) {
      // silently try next gateway
      continue;
    }
  }

  console.warn("All IPFS gateways failed for", tokenURI);
  return EMPTY_METADATA;
};
