import mongoose from "mongoose";
import { Token } from "../mongoDb/schemas/sch.nft";
import { StakeEventModel, StakeEventType, StakeType } from "../mongoDb/schemas/sch.StakeEvent";
import { StakeNFT, StakeStatus } from "../mongoDb/schemas/sch.StakeNft";
import { UserNonce } from "../mongoDb/schemas/sch.userNonce";
import { Profile } from "../mongoDb/schemas/sch.userProfile";
import { Payload } from "../types";

export async function handleStakedNfts({ chainId, event }: Payload) {
  const { user, nft, tokenIds, amount, headPrice, isErc1155 } = event.args;

  const lowerUser = user?.toLowerCase();
  const lowerContractAddress = nft?.toLowerCase();
  const userData = await Profile.findOne({ address: lowerUser });

  if (!userData) return;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const date = Date.now();
    const numAmount = Number(amount);

    // Convert tokenIds (BigInt[]) → number[]
    const parsedTokenIds = tokenIds.map((id: bigint) => Number(id));

    if (isErc1155) {
      const token = await Token.findOne({ chainId, contractAddress: lowerContractAddress, tokenId: parsedTokenIds[0] }, { _id: 1 }).session(session);

      if (!token) throw new Error("Token not found");

      const stakeDoc = {
        user: lowerUser,
        nftRefs: [token._id],
        chainId,
        collectionAddress: lowerContractAddress,
        quantity: numAmount,
        isBundle: true,
        isErc1155,
        nativeAmount: headPrice.toString(),
        startedAt: date,
        status: StakeStatus.UNACTIVE,
      };

      // create stake
      await StakeNFT.create([stakeDoc], { session });

      // atomic quantity decrease
      await Token.updateOne(
        {
          _id: token._id,
          [`erc1155Holders.${lowerUser}.quantity`]: { $gte: numAmount },
        },
        {
          $inc: {
            [`erc1155Holders.${lowerUser}.quantity`]: -numAmount,
          },
        },
        { session },
      );
    } else {
      const tokens = await Token.find({ chainId, contractAddress: lowerContractAddress, tokenId: { $in: parsedTokenIds } }).session(session);
      const tokensMongoIds = tokens.map((e) => e._id);

      if (!tokens.length) throw new Error("Tokens not found");

      const stakeDoc = {
        user: lowerUser,
        nftRefs: tokensMongoIds,
        chainId,
        quantity: 1,
        collectionAddress: lowerContractAddress,
        isErc1155,

        isBundle: true,
        nativeAmount: headPrice.toString(),
        startedAt: date,

        status: StakeStatus.UNACTIVE,
      };

      await Token.updateMany({ _id: { $in: tokensMongoIds } }, { $set: { isStaked: true } }, { session });
      await StakeNFT.create([stakeDoc], { session });
    }

    await StakeEventModel.create(
      [
        {
          chainId,
          stakeType: StakeType.BUNDLE,
          eventType: StakeEventType.STAKE,
          isNative: true,
          address: lowerUser,
          amount: headPrice.toString(),
          txHash: event.transactionHash,
          timestamp: date,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("handleStakedNfts error:", error);
  }
}

export async function handleUnStakedNfts({ chainId, event }: Payload) {
  const { user, nft, tokenIds, amount, nonce, isErc1155 } = event.args;
  const normalizedAddress = user.toLowerCase();
  const lowerContractAddress = nft?.toLowerCase();

  const userData = await Profile.findOne({ address: normalizedAddress });
  if (!userData) return;

  try {
    const numAmount = Number(amount);

    const parsedTokenIds = tokenIds.map((id: bigint) => Number(id));
    if (isErc1155) {
      const token = await Token.findOne({ chainId, contractAddress: lowerContractAddress, tokenId: parsedTokenIds[0] });
      if (!token) throw new Error("Token not found");

      const erc1155Holders = token.erc1155Holders || new Map();
      const holderData = erc1155Holders.get(normalizedAddress);
      holderData.quantity += numAmount;
      erc1155Holders.set(normalizedAddress, holderData);
      token.erc1155Holders = erc1155Holders;

      await token.save();
    } else {
      const tokens = await Token.find({ chainId, contractAddress: lowerContractAddress, tokenId: { $in: parsedTokenIds } });
      const tokensMongoIds = tokens.map((e) => e._id);

      if (!tokens.length) throw new Error("Tokens not found");

      await Token.updateMany({ _id: { $in: tokensMongoIds } }, { $set: { isStaked: false } });
    }
    await UserNonce.findOneAndUpdate({ address: normalizedAddress, chainId }, { $inc: { stakeNonce: Number(nonce) + 1 } }, { upsert: true });
  } catch (error) {
    console.error("handleUnStakedNfts error:", error);
  }
}
