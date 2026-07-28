import { Router } from "express";

import { getDozSwapRestrictionStatus, listPositions, logMint, logRemove, updateDozSwapRestrictionStatus } from "../mongoDb/controllers/c.admin-poolAdmin";

import { exportSwapTransactionsCsv, listSwapTransactions } from "../mongoDb/controllers/c.admin-swapTx";


const router = Router();


// ! ---- SWAP Tx
router.get("/swap/tx", listSwapTransactions);
router.get("/swapTx/export", exportSwapTransactionsCsv);


// ! ---- Pool Admin Manager--------------
router.post("/positions/mint", logMint);
router.post("/positions/remove", logRemove);
router.get("/positions", listPositions);
router.get("/positions/doz-restriction", getDozSwapRestrictionStatus);
router.put("/positions/doz-restriction", updateDozSwapRestrictionStatus);


export default router;
