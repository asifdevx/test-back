import { ethers, keccak256, toUtf8Bytes } from "ethers";

const backendPrivateKey = process.env.PRIVATE_KEY;
export const backendWallet = new ethers.Wallet(backendPrivateKey);
type SignParams = {
  types: string[];
  values: any[];
};

async function signPacked({ types, values }: SignParams) {
  const messageHash = ethers.solidityPackedKeccak256(types, values);
  return backendWallet.signMessage(ethers.getBytes(messageHash));
}

export const generatePackageSignature = (params: { address: string; pkgId: number; amountWei: string; expireTimestamp: number; chainId: number; callType: string }) => {
  // Contract expects: keccak256(abi.encodePacked(user, pkgId, amountWei, expireTimestamp, chainId, keccak256(bytes(callType))))
  // So we hash the callType here to match the contract's _hash function
  const callTypeHash = keccak256(toUtf8Bytes(params.callType));

  return signPacked({
    types: ["address", "uint8", "uint128", "uint256", "uint256", "bytes32"],
    values: [
      params.address,
      params.pkgId,
      params.amountWei,
      params.expireTimestamp,
      params.chainId,
      callTypeHash, // ✅ Use the hashed callType for signing
    ],
  });
};
export const generateFeeSignature = (params: { address: string; feeBps: number; packageId: number }) =>
  signPacked({
    types: ["address", "uint256", "uint8"],
    values: [params.address, params.feeBps, params.packageId],
  });

export const genaretFillOrderSigniture = (o: any) =>
  signPacked({
    types: ["address", "address", "address", "uint256", "uint256", "bool", "uint256", "uint256", "uint256"],
    values: [o.maker, o.taker, o.token, o.tokenId, o.amount, o.is1155, o.price, o.expiration, o.salt],
  });

export const genaretClaimDoz = (params: { claimer: string; amount: string; nonce: number }) =>
  signPacked({
    types: ["address", "uint256", "uint256"],
    values: [params.claimer, params.amount, params.nonce],
  });

export const genaretStakeNfts = (params: { user: string; nonce: number; chainId: number }) =>
  signPacked({
    types: ["address", "uint256", "uint256"],
    values: [params.user, params.nonce, params.chainId],
  });

export const genaretPaySignature = (params: { sessionId: string; buyer: string; merchant: string; amount: bigint | string; feeInBps: number; token: string; chainId: number }) =>
  signPacked({
    types: ["bytes32", "address", "address", "uint256", "uint256", "address", "uint256"],
    values: [params.sessionId, params.buyer, params.merchant, params.amount, params.feeInBps, params.token, params.chainId],
  });
export const genaretPayRefundSignature = (params: { sessionId: string; amount: bigint | string; token: string; receiver: string }) =>
  signPacked({
    types: ["bytes32", "uint256", "address", "address"],
    values: [params.sessionId, params.amount, params.token, params.receiver],
  });

