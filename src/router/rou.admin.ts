import { Router } from "express";

import { getDozSwapRestrictionStatus, listPositions, logMint, logRemove, updateDozSwapRestrictionStatus } from "../mongoDb/controllers/c.admin-poolAdmin";

import { exportSwapTransactionsCsv, listSwapTransactions } from "../mongoDb/controllers/c.admin-swapTx";
import { getAllChains, getTokenCardDetails, getTokenDetail } from "../mongoDb/controllers/c.swap";


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



router.get("/swap", getAllChains);
// router.get("/tokens", getTokenCardDetails);
// router.get("/tokens/:chainId/:contractAddress", getTokenDetail);
export default router;
