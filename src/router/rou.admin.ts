import { Router } from "express";

import { getDozSwapRestrictionStatus, listPositions, logMint, logRemove, updateDozSwapRestrictionStatus } from "../mongoDb/controllers/c.admin-poolAdmin";
import { Request,Response } from "express";
import { exportSwapTransactionsCsv, listSwapTransactions } from "../mongoDb/controllers/c.admin-swapTx";
import { getAllChains, getTokenCardDetails, getTokenDetail } from "../mongoDb/controllers/c.swap";
import { Chain } from "../mongoDb/schemas/sch.paymentChain";


const router = Router();


// ! ---- SWAP Tx
router.get("/admin/swap/tx", listSwapTransactions);
router.get("/admin/swapTx/export", exportSwapTransactionsCsv);


// ! ---- Pool /Admin Manager--------------
router.post("/admin/positions/mint", logMint);
router.post("/admin/positions/remove", logRemove);
router.get("/admin/positions", listPositions);
// router.get("/admin/positions/doz-restriction", getDozSwapRestrictionStatus);
// router.put("/admin/positions/doz-restriction", updateDozSwapRestrictionStatus);



router.get("/swap", async(req: Request, res: Response) =>{
  try {
    const chains = await Chain.find({ isActive: true }).lean();

    if (!chains.length) {
      return res.status(404).json({
        success: false,
        message: "No chains found",
        data: [],
      });
    }

    return res.json({
      success: true,
      message: "Chains fetched successfully",
      data: chains,
    });
  } catch (error) {
    console.error("GET /chains error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
// router.get("/tokens", getTokenCardDetails);
// router.get("/tokens/:chainId/:contractAddress", getTokenDetail);
export default router;
