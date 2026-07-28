import { ethers } from "ethers";
import { Request, Response } from "express";
import mongoose from "mongoose";
import { unbondDelays } from "../../config/stakingCofig";
import { getTokenPrices } from "../../utils/price";
import { genaretClaimDoz, genaretStakeNfts } from "../../utils/signature";
import { Collection } from "../schemas/collection.schema";
import { DozAdminModel } from "../schemas/sch.DozRewordPool";
import { RewardConditionModel } from "../schemas/sch.RewardCondition";
import { StakeEventModel, StakeEventType, StakeType } from "../schemas/sch.StakeEvent";
import { StakeNFT, StakeStatus } from "../schemas/sch.StakeNft";
import { Validator } from "../schemas/sch.Validator";
import { Token } from "../schemas/sch.nft";
import { StakeBonus } from "../schemas/sch.stakeBonus";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
import { UserNonce } from "../schemas/sch.userNonce";
/*
 ! ACTIVE VALIDATOR DATA FOR SAKING 
*/
export const getStakeValidatorData = async (req: Request, res: Response) => {
  try {
    const { chainId } = req.query;

    if (!chainId) {
      return res.status(400).json({
        success: false,
        error: "chainId is required",
      });
    }

    const data = await Validator.findOne({
      chainId: Number(chainId),
      status: "active",
      isHealthy: true,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "No active validator found",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error("[getStakeValidatorData]", err);

    return res.status(500).json({
      success: false,
      error: err?.message || "Internal server error",
    });
  }
};

/**
 *  @pragma handleUpdateCoinStake
 *  @description
 *  Handles creation and update of stakes.
 * - If `isBundle` is true: updates an existing NFT bundle stake.
 * - If `isBundle` is false: creates a new coin-only stake.
 *
 *  @pragma params
 *  @param user Delegator **wallet address** (string)
 *  @param nftIds Array of NFT ObjectIds (string[]) - only for bundle stakes
 *  @param chainId Network Chain ID (number)
 *  @param validatorId Validator ObjectId (string)
 *  @param quantity Quantity of tokens (number)
 *  @param amount Amount in Wei (string)
 *  @param lockPeriod Lock period in days (string | number)
 *  @param isBundle Boolean flag indicating bundle (NFT+Coin) or coin-only
 *
 * @pragma returns
 * JSON response with updated/created stake or error message
 */
export const handleUpdateCoinStake = async (req: Request, res: Response) => {
  const { user, nftIds = [], chainId, validatorId, quantity, amount, lockPeriod, isBundle, txHash = "" } = req.body as handleUpdateCoinStakeProps;

  try {
    const unlockAt = new Date(Date.now() + Number(lockPeriod) * 24 * 60 * 60 * 1000);
    // // ADD to validator  TOTAL delegation
    const normalizeUser = user.toLowerCase();
    const validator = await Validator.findById(validatorId);
    if (!validator) throw new Error("Validator not found");
    const totalAmount = String(BigInt(validator.totalDelegated) + BigInt(amount));
    validator.totalDelegated = totalAmount;
    await validator.save();
    if (isBundle) {
      // ----------- Update existing bundle stake -----------
      const objectIds = nftIds.map((id) => new mongoose.Types.ObjectId(id));

      const stakedNft = await StakeNFT.findOne({
        user: normalizeUser,
        nftRefs: { $all: objectIds },
        quantity,
      });

      if (!stakedNft) {
        return res.status(400).json({ error: "Failed to update - could not find staked NFTs" });
      }

      stakedNft.unlockAt = unlockAt;
      stakedNft.nativeAmount = amount;
      stakedNft.validatorId = new mongoose.Types.ObjectId(validatorId);
      stakedNft.status = StakeStatus.ACTIVE;

      await stakedNft.save();

      return res.json({ message: "Bundle stake updated successfully" });
    } else {
      // ----------- Create a new coin-only stake -----------

      await StakeNFT.create({
        user: normalizeUser,
        chainId,
        quantity: quantity || 1,
        validatorId: new mongoose.Types.ObjectId(validatorId),
        nativeAmount: amount,
        unlockAt,
        status: StakeStatus.ACTIVE,
        isBundle: false,
      });
      await StakeEventModel.create({
        chainId,
        stakeType: StakeType.COIN,
        eventType: StakeEventType.STAKE,
        address: user,
        amount,
        txHash: txHash,
        timestamp: new Date(),
      });
      return res.json({ message: "Coin stake created successfully" });
    }
  } catch (err: any) {
    console.error("❌ ERROR:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};

/**
 * @route GET /api/staking/my
 * @description Get all staking details for a user
 * @query address Delegator wallet address
 * @returns JSON array of user's stakes
 */
export const getMyStaking = async (req: Request, res: Response) => {
  const { address } = req.query as { address: string };
  if (!address) {
    return res.status(400).json({ error: "User ADdress required" });
  }
  try {
    const stakes = await StakeNFT.find({ user: address.toLowerCase(), status: { $ne: StakeStatus.UNACTIVE } })
      .populate("nftRefs", "tokenId image name contractAddress -_id")
      .populate("validatorId", "_id validatorId creditContract chainId");

    const data = stakes.map((stake) => {
      const obj = stake.toObject() as typeof stake & {
        nftRefs?: Array<{ contractAddress?: string }>;
      };

      const collectionAddress = obj.nftRefs && obj.nftRefs.length > 0 && "contractAddress" in obj.nftRefs[0] ? obj.nftRefs[0].contractAddress : null;

      return {
        ...stake.toObject(),
        collectionAddress,
      };
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching user stakes:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * @param address
 * @returns it return All necessary data for an user
 */
export const getMyDoz = async (req: Request, res: Response) => {
  try {
    const { address } = req.query as { address: string };
    if (!address) {
      return res.status(400).json({ success: false, message: "Address is required" });
    }
    const normalizedAddress = address.toLowerCase();
    let userData = await StakeBonus.findOne({ user: normalizedAddress });
    if (!userData) {
      userData = await StakeBonus.create({ user: normalizedAddress, amount: 0, nonce: 1 });
    }
    const admin = await DozAdminModel.findById("admin", { minWithdraw: 1 });
    return res.status(200).json({ success: true, data: { user: userData.user, amount: userData.amount, nonce: userData.nonce, minWithdraw: admin?.minWithdraw || "0" } });
  } catch (error) {
    console.error("getMyDoz error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getMyStakingActivity = async (req: Request, res: Response) => {
  const {
    address,
    page = "1",
    limit = "10",
  } = req.query as {
    address: string;
    page?: string;
    limit?: string;
  };
  if (!address) {
    return res.status(400).json({ success: false, message: "Address is required" });
  }

  try {
    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.max(parseInt(limit), 1);
    const skip = (pageNum - 1) * limitNum;
    const [data, total] = await Promise.all([
      StakeEventModel.find({ address: address.toLowerCase() }).select("-address -_id").sort({ timestamp: -1 }).skip(skip).limit(limitNum),
      StakeEventModel.countDocuments({ address: address.toLowerCase() }),
    ]);
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        hasMore: skip + data.length < total,
      },
    });
  } catch (error) {
    console.error("getMyStakingActivity error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getPublicStakingActivity = async (req: Request, res: Response) => {
  const {
    chainId: stringChainId,
    page = "1",
    limit = "10",
  } = req.query as {
    chainId: string;
    page?: string;
    limit?: string;
  };
  if (!stringChainId) {
    return res.status(400).json({ success: false, message: "ChainId is required" });
  }
  try {
    const chainId = Number(stringChainId);
    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.max(parseInt(limit), 1);
    const skip = (pageNum - 1) * limitNum;
    const [data, total] = await Promise.all([
      StakeEventModel.find({ chainId, stakeType: { $ne: "token" } })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum),
      StakeEventModel.countDocuments({ chainId, stakeType: { $ne: "token" } }),
    ]);
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        hasMore: skip + data.length < total,
      },
    });
  } catch (error) {
    console.error("getMyStakingActivity error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * 🔧 Function: // ! unStakeAssets
 *
 * 📌 Purpose:
 * ! Unstake The Amount from validator
 *
 * 1️⃣  Find By Id
 * 2️⃣ Case if avax then direct Claim ,
 * 3️⃣ Other wish just mske it UnBount
 *
 * 📥 Parameters:
 *  @ _id: The ID of the staking item to be unstaked
 *
 * 📤 Returns:
 *  Success or failure response indicating the result of unstaking operation
 */

export const unStakeAssets = async (req: Request, res: Response) => {
  const { _id, txHash } = req.body;
  if (!_id) {
    return res.status(400).json({ success: false, message: "Missing staking item ID" });
  }

  try {
    const stakingItem = await StakeNFT.findById(_id);

    if (!stakingItem) {
      return res.status(404).json({ success: false, message: "Staking item not found" });
    }
    const totalAmount = BigInt(stakingItem.nativeAmount) + BigInt(stakingItem.rewardAmount || "0");
    const validator = await Validator.findById(stakingItem.validatorId);
    const currentValidatorTvl = BigInt(validator?.totalDelegated || "0");
    const afterUnstakeTvl = currentValidatorTvl - totalAmount;
    await Validator.findByIdAndUpdate(stakingItem.validatorId, { totalDelegated: afterUnstakeTvl.toString() });
    const chainId = stakingItem.chainId;
    const delayDays = unbondDelays[chainId] ?? 0;
    const now = new Date();

    if (chainId === 43114 || chainId === 43113) {
      await StakeNFT.findByIdAndUpdate(_id, { status: StakeStatus.CLAIMED, unbondAt: new Date() });
    } else {
      const unbondAt = new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
      await StakeNFT.findByIdAndUpdate(_id, {
        status: StakeStatus.UNBONDING,
        unbondAt,
      });
    }
    await StakeEventModel.create({
      chainId,
      stakeType: stakingItem.isBundle ? StakeType.BUNDLE : StakeType.COIN,
      address: stakingItem.user,
      amount: totalAmount.toString(),
      txHash: txHash,
      timestamp: Date.now(),
      eventType: chainId === 43114 || chainId === 43113 ? StakeEventType.CLAIM : StakeEventType.UNBOND,
    });
    return res.status(200).json({ success: true, message: "Assets unstaked successfully" });
  } catch (error) {
    console.error("unStakeAssets error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const claimAssets = async (req: Request, res: Response) => {
  const { _id, txHash } = req.body;
  if (!_id) {
    return res.status(400).json({ success: false, message: "Missing staking item ID" });
  }
  try {
    const stakingItem = await StakeNFT.findById(_id);

    if (!stakingItem) {
      return res.status(404).json({ success: false, message: "Staking item not found" });
    }
    const totalAmount = BigInt(stakingItem.nativeAmount) + BigInt(stakingItem.rewardAmount || "0");
    const chainId = stakingItem.chainId;
    await StakeNFT.findByIdAndUpdate(_id, { status: StakeStatus.CLAIMED });
    await StakeEventModel.create({
      chainId,
      stakeType: stakingItem.isBundle ? StakeType.BUNDLE : StakeType.COIN,
      address: stakingItem.user,
      amount: totalAmount.toString(),
      txHash: txHash,
      timestamp: Date.now(),
      eventType: StakeEventType.CLAIM,
    });
    return res.json({success:true})
  } catch (error) {
    return res.status(500).json({ success: false , message:"Server Error" });

  }
};
export const checkMonStakingForUser = async (req: Request, res: Response) => {
  const { chainId, address } = req.body;
  try {
    const stakingItem = await StakeNFT.findOne({ chainId, user: address.toLowerCase(), status: { $nin: [StakeStatus.CLAIMED, StakeStatus.UNACTIVE] } });
    return res.status(200).json({ success: true, existed: !!stakingItem });
  } catch (error) {
    console.error("checkMonStakingForUser error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const updateMonadWithdrawId = async (req: Request, res: Response) => {
  const { nftId, withdrawId } = req.body;

  try {
    await StakeNFT.findByIdAndUpdate(nftId, { withdrawId });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("updateMonadWithdrawId error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getStakingCollectionData = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, chainId, address } = req.query as { page?: string; limit?: string; chainId?: string; address?: string };

  const numPage = Number(page);
  const numLimit = Number(limit);
  try {
    const query: any = {
      chainId: Number(chainId),
      contractType: "ERC721",
      [`holders.${address?.toLowerCase()}`]: { $exists: true },
    };

    const [collections, total] = await Promise.all([
      Collection.find(query)
        .skip((numPage - 1) * numLimit)
        .limit(numLimit)
        .select("-_id name collectionAddress avatarUrl"),
      Collection.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: collections,
      pagination: {
        page: numPage,
        limit: numLimit,
        total,
        hasMore: numPage * numLimit < total,
      },
    });
  } catch (error) {
    console.error("getStakingCollectionData error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const getTokenColNftData = async (req: Request, res: Response) => {
  const { page, limit = 10, chainId, collectionAddress, address } = req.query as { page?: string; limit?: string; chainId?: string; collectionAddress?: string; address?: string };

  const numPage = Number(page);
  const numLimit = Number(limit);
  try {
    const query: any = {
      chainId,
      contractAddress: collectionAddress?.toLowerCase(),
      $or: [{ isStaked: false }, { isStaked: { $exists: false } }],
      seller: address?.toLowerCase(),
      "listing.isListed": { $exists: true, $eq: false },
      "auction.isListed": { $exists: true, $eq: false },
    };

    const [nfts, total] = await Promise.all([
      Token.find(query)
        .sort({ createdAt: 1, _id: 1 })
        .skip((numPage - 1) * numLimit)
        .limit(numLimit)
        .select("_id tokenId name image"),
      Token.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: nfts,
      pagination: {
        page: numPage,
        limit: numLimit,
        total,
        hasMore: numPage * numLimit < total,
      },
    });
  } catch (error) {
    console.error("getStakingCollectionData error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// --------------- Genaretor -------------
export const getDozGeneratedSignature = async (req: Request, res: Response) => {
  const { address, amountInWei } = req.body;
  if (!address) {
    return res.status(400).json({ success: false, message: "Address is required" });
  }
  try {
    const normalizedAddress = address.toLowerCase();
    let userData = await StakeBonus.findOne({ user: normalizedAddress });
    if (!userData) {
      return res.status(404).json({ success: false, message: "User data not found" });
    }
    const signature = await genaretClaimDoz({ claimer: normalizedAddress, amount: amountInWei, nonce: userData.nonce });
    return res.status(200).json({ success: true, signature });
  } catch (error) {
    console.error("getDozGeneratedSignature error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const getStakeGeneratedSignature = async (req: Request, res: Response) => {
  const { address, chainId } = req.body;
  if (!address || !chainId) {
    return res.status(400).json({ success: false, message: "Address is required" });
  }
  try {
    const normalizedAddress = address.toLowerCase();
    const nonce = await UserNonce.findOne({ address: normalizedAddress, chainId });

    const signature = await genaretStakeNfts({ user: address, chainId, nonce: nonce?.stakeNonce || 1 });
    return res.status(200).json({ success: true, signature, nonce: nonce?.stakeNonce || 1 });
  } catch (error) {
    console.error("getStakeGeneratedSignature error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
// ---------------- user DOZ ----------------
export const calculateDozReward = async (req: Request, res: Response) => {
  const { address, chainId, amountInWei, nftLength, period } = req.body as { address: string; chainId: number; amountInWei: string; nftLength: number; period: number };
  if (!address || !chainId || !amountInWei || !nftLength || !period) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }
  try {
    const normalPrice = ethers.formatUnits(amountInWei, 18);
    const numAmount = Number(normalPrice);

    const userPkg = await SubscriptionModel.findOne({ address: address.toLowerCase() }).select("packages");
    const pkgId = userPkg?.packages?.nft?.pkgId ?? 0;

    if (!userPkg) {
      return res.status(400).json({ success: false, message: "User package not found" });
    }

    const [rewardCondition, dozValue] = await Promise.all([RewardConditionModel.findOne({ packageId: pkgId, chainId, period }), DozAdminModel.findById("admin", { dozValueInUsd: 1 })]);

    if (!rewardCondition) {
      return res.status(400).json({ success: false, message: "Reward condition not found" });
    }
    const networkValue = await getTokenPrices(chainId);
    const totalAmountInUSd = numAmount * networkValue;
    const perNftReward = (totalAmountInUSd * rewardCondition.percentage) / 10000;

    const totalRewardInUsd = perNftReward * nftLength;
    const amountInDoz = totalRewardInUsd / dozValue?.dozValueInUsd!;

    return res.status(200).json({ success: true, amountInDoz });
  } catch (error) {
    console.error("getDozCalculationAmount error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const addDozReward = async (req: Request, res: Response) => {
  const { user, dozReward } = req.body;

  if (!user || dozReward === undefined) {
    return res.status(400).json({
      success: false,
      message: "User and dozReward are required",
    });
  }

  if (typeof dozReward !== "number" || dozReward <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid reward amount",
    });
  }

  try {
    const normalizedAddress = user.toLowerCase();

    const updated = await StakeBonus.findOneAndUpdate(
      { user: normalizedAddress },
      { $inc: { amount: dozReward } }, // atomic increment
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "User data not found",
      });
    }
    // decrement value from admin
    const poolAmount = await DozAdminModel.findById("admin", { contractBalance: 1 });
    const safeValue = dozReward.toString();
    const trimmedValue = Number(safeValue).toFixed(18);

    const bigDozValue = ethers.parseUnits(trimmedValue, 18);
    const diff = BigInt(poolAmount?.contractBalance!) - bigDozValue;
    await DozAdminModel.findByIdAndUpdate("admin", { contractBalance: diff.toString() });

    await StakeEventModel.create({
      chainId: 43114,
      stakeType: StakeType.TOKEN,
      eventType: StakeEventType.STAKE,
      address: normalizedAddress,
      amount: bigDozValue.toString(),
      timestamp: Date.now(),
    });
    return res.status(200).json({
      success: true,
      message: "DOZ reward added successfully",
      amount: updated.amount,
    });
  } catch (error) {
    console.error("addDozReward error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

//! -------------  helper

//! TYpes ------------------

interface handleUpdateCoinStakeProps {
  user: string;
  nftIds: string[];
  quantity?: number;
  chainId: number;
  validatorId: string;
  amount: string;
  lockPeriod: string;
  isBundle: boolean;
  txHash?: string;
}
