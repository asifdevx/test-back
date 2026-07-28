import { Request, Response } from "express";
import mongoose from "mongoose";
import { StakingSessionModel } from "../schemas/sch.StakingSession";
import { Token } from "../schemas/sch.nft";

export const startSession = async (req: Request, res: Response) => {
  const { address, chainId, isBundle, nftIds, stakeAmount } = req.body;


  try {
    const lowerAddress = (address as string).toLowerCase();
    let session = await StakingSessionModel.findOne({
      address: lowerAddress,
      chainId,
      step: { $lt: 4 },
    });

    if (!session) {
      session = await StakingSessionModel.create({
        address,
        chainId,
        isBundle,
        stakeAmount,
        nftIds,
      });
    }
    return res.status(201).json(session);
  } catch (error) {
    return res.status(500).json({ error: "Failed to start staking session" });
  }
};

export const updateSession = async (req: Request, res: Response) => {
  try {
    const { sessionId, step, txHash } = req.body;

    const session = await StakingSessionModel.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (step <= session.step) {
      return res.json(session);
    }

    session.step = step;

    if (step === 1) session.feeTx = txHash;
    if (step === 2) session.coinTx = txHash;
    if (step === 3) session.nftApproveTx = txHash;
    if (step === 4) session.nftStakeTx = txHash;

    await session.save();
    return res.status(201).json(session);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update step" });
  }
};

export const getSession = async (req: Request, res: Response) => {
  try {
    const { address, chainId } = req.query;

    if (!address || !chainId) {
      return res.status(400).json({ error: "Missing params" });
    }

    const session = await StakingSessionModel.findOne({
      address: (address as string).toLowerCase(),
      chainId: Number(chainId),
      step: { $lt: 4 },
    }).lean();

    if (!session) return res.json(null);

    let nfts: any[] = [];

    if (session.isBundle && session.nftIds?.length) {
      nfts = await Token.find(
        {
          _id: { $in: session.nftIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
        {
          _id: 0,
          tokenId: 1,
          contractAddress: 1,
          name: 1,
          image: 1,
        },
      ).lean();
    }

    return res.json({
      ...session,
      nfts,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Fetch failed" });
  }
};

export const deleteSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      message: "sessionId is required",
    });
  }

  try {
    const deleted = await StakingSessionModel.findByIdAndDelete(sessionId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Session deleted successfully",
    });
  } catch (error: any) {
    console.error("deleteSession error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
