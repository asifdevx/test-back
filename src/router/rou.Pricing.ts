import { Router } from "express";
import { getPricingList } from "../mongoDb/controllers/c.admin-pricing";



const router = Router();

router.get("/", getPricingList);

export default router;