import { Router } from "express";
import { createSwapTransaction } from "../mongoDb/controllers/c.admin-swapTx";
import { getAllChains, getDozLegQuote, getSwapQuote, getTokenCardDetails, getTokenDetail } from "../mongoDb/controllers/c.swap";

const router = Router();

router.get("/", getAllChains);
router.get("/tokens", getTokenCardDetails);
router.get("/tokens/:chainId/:contractAddress", getTokenDetail);

router.post("/quote", getSwapQuote);
router.post("/quote/leg", getDozLegQuote);

// store Tx 
router.post("/tx", createSwapTransaction);
export default router;
