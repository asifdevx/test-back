import { Request, Response, Router } from "express";

import { StakeNFT } from "../schemas/sch.StakeNft";
const router = Router();

/**
 * GET /staking
 * Query params: page, limit, search, chainId
 */
export const getStakingDetails = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string)?.toLowerCase() || "";
    const chainId = req.query.chainId ? Number(req.query.chainId) : undefined;

    const query: any = {};
    if (search) query.user = { $regex: search, $options: "i" };
    if (chainId) query.chainId = chainId;

    const items = await StakeNFT.find(query)
      .sort({ unlockAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await StakeNFT.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: items,
      page,
      total,
      limit,
      totalPages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



/**
 * petch /staking/:id
 */
export const upgradeStaking = async (req:Request, res:Response) => {
  try {
    const { id } = req.params;
    const updatedItem = await StakeNFT.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedItem) return res.status(404).json({ success: false, message: "Staking not found" });

    res.json({ success: true, data: updatedItem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * DELETE /staking/:id
 */
export const deleteStaking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await StakeNFT.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Staking not found" });

    res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default router;
