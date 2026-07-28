
export const IPFS_GATEWAYS = [
  process.env.PINATA_GATEWAY!, // your private pinata gateway
  "https://gateway.pinata.cloud/ipfs",
  "https://alchemy.mypinata.cloud/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
  "https://ipfs.io/ipfs",
  "https://dweb.link/ipfs",
  
].filter(Boolean);
