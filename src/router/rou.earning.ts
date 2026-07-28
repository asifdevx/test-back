import { Router } from "express";
import { getDailyMarketplaceEarnings, handleIncrementEarning, handlePlaformFeeEvents } from "../mongoDb/controllers/c.earning";



const router= Router();

router.post("/add",handleIncrementEarning)

router.get(
  "/analytics/marketplace-earnings/daily",
  getDailyMarketplaceEarnings
);

router.post("/event",handlePlaformFeeEvents)

export default router;