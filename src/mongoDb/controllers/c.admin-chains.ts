import { Request, Response } from "express";
import { Chain } from "../schemas/sch.paymentChain";

export const createRegister = async (req: Request, res: Response) => {
  try {
    const { chainId, token } = req.body;

    if (!chainId || !token?.contractAddress) {
      return res.status(400).json({ message: "chainId and token required" });
    }

    // normalize address (important for duplicate check)
    const contractAddress = token?.contractAddress?.toLowerCase();

    let chain = await Chain.findOne({ chainId });

    // 👉 if chain doesn't exist → create empty one
    if (!chain) {
      chain = await Chain.create({
        chainId,
      });
    }

    // 👉 check duplicate contract
    const exists = chain.tokens.some((t) => t.contractAddress.toLowerCase() === contractAddress);

    if (exists) {
      return res.status(409).json({
        message: "Token already registered on this chain",
      });
    }

    // 👉 push new token
    chain.tokens.push({
      ...token,
      contractAddress,
    });

    await chain.save();

    return res.status(201).json({
      message: "Token registered successfully",
      data: chain,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getChainsRegister = async (req: Request, res: Response) => {
  try {
    const { chainId } = req.query;

    if (!chainId) {
      return res.status(400).json({ message: "chainId is required" });
    }

    const parsedChainId = Number(chainId);

    let chain = await Chain.findOne({ chainId: parsedChainId });

    if (!chain) {
      return res.status(200).json({
        data: [],
      });
    }

    return res.status(200).json({
      data: chain.tokens ?? [],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const deleteRegister = async (req: Request, res: Response) => {
  const { chainId, id } = req.body;
  if (!chainId || !id) {
    return res.status(400).json({
      message: "chainId and id are required",
    });
  }
  try {
    const updated = await Chain.findOneAndUpdate(
      { chainId: Number(chainId) },
      {
        $pull: {
          tokens: { _id: id },
        },
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "Chain not found" });
    }

    return res.status(200).json({
      message: "Token deleted successfully",
      data: updated,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
