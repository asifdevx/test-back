// router/rou.auth.ts  — 🔑 NEW FILE
import { Router } from "express";
import { authMiddleware } from "../middleware/middleware-auth";
import { getCurrentUser, logout, refreshToken, requestMessage, verifyAndSignIn } from "../mongoDb/controllers/c.auth";

const router = Router();

router.post("/request-message", requestMessage);
router.post("/verify-signature", verifyAndSignIn);
router.post("/refresh", refreshToken);
router.post("/logout", logout);
router.get("/me", authMiddleware, getCurrentUser); 

export default router;
