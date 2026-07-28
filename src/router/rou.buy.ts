import express, { Request, Response } from 'express';
import { genaretOrderSigniture } from '../mongoDb/controllers/c.buy';


const router = express.Router();

router.post('/get-signatures', genaretOrderSigniture);
export default router;
