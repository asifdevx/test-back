import express from "express";

import { getNextPlanDetails, getUserSubscription, paymentCheckoutDetails } from "../mongoDb/controllers/c.pricing";



const router = express.Router();

router.get("/subscription", getUserSubscription);

/**
 * GET /api/package/quote
 * Query: ?address=0x...&newPkgId=2&chainId=137
 * Returns preview: priceUSD, discountUSD, amountNativeStr, amountWei (string), expireTimestamp, nonce
 */

router.post("/quote", getNextPlanDetails);
/**
 * POST /api/package/create-order
 * Body: { address, newPkgId, chainId }
 * 
 */
router.post("/create-order", paymentCheckoutDetails);


export default router;
