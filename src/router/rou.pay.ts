import { Router } from "express";
import { payAuthMiddleware } from "../middleware/payAuth";
import { createSession, createSubscriptionSession, getDozPrice, getPoolingDetails, getSessionDetail } from "../mongoDb/controllers/c.pay";
const router = Router();

// 🔥 Payment Gateway (public)
router.post("/session/create", createSession);
router.post("/subscription/session/create", createSubscriptionSession);
router.post("/payments/:sessionId", payAuthMiddleware, getSessionDetail);
router.post("/payments", payAuthMiddleware, getPoolingDetails);
router.post("/doz", getDozPrice);

export default router;
