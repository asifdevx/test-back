import { Router } from "express";
import { getUserData, updateUserInfo, completeOnboarding } from "../mongoDb/controllers/c.user";



const router = Router();

router.get('/session',  getUserData);
router.patch('/',  updateUserInfo);
router.post('/onboarding-complete',  completeOnboarding);




export default router;