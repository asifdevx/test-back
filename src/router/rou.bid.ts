import { Router } from 'express';
import {handlePlaceBid, getUserBid} from "../mongoDb/controllers/c.bid"
const router = Router();

router.get('/user-bid', getUserBid);

router.post("/place-bid",handlePlaceBid);

export default router;
