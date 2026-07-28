import express, { Request, Response } from 'express';
import { sendOTP, verifyOTP } from '../mongoDb/controllers/c.otp';

const router = express.Router();


router.post('/sendOtp', sendOTP);

router.post('/verifyOtp', async (req: Request, res: Response) => {
  try {
    const { address, email, otp } = req.body;

    if (!address || !otp || !email) return res.status(500).json({ message: 'address & otp required' });

    const data = await verifyOTP(address, email, otp);

    
    return res.status(200).json(data);
  } catch (error) {
 
    return res.status(500).json({ message: 'otp not match ' });
  }
});

export default router;
