import express, { Request, Response } from 'express';
import { adminReview, adminUpdateKyc, getKycByAddress, getRecentKyc, submitKyc } from '../mongoDb/controllers/c.kyc';

const router = express.Router();

//user data
router.get('/user/:address', async (req: Request, res: Response) => {
  const  address  = req.params.address as string;

  try {
    const kyc = await getKycByAddress(address);

    if (!kyc) {
      return res.json({ exists: false, data: null });
    }

    return res.json({ exists: true, data: kyc });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});
//allow admin to saw 50 nft data
router.get('/admin/recent', async (req: Request, res: Response) => {
  try {
    const list = await getRecentKyc();
    return res.json({ count: list.length, data: list });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch recent KYCs' });
  }
});

router.post('/submit', async (req: Request, res: Response) => {
  const { address, personalInfo, documents } = req.body;
  try {
    const kyc = await submitKyc({ address, personalInfo, documents });
    return res.status(200).json({ message: 'KYC Submitted Sucessfully', status: kyc?.status });
  } catch (error) {
    return res.status(404).json({ message: 'KYC Submitted Failed' });
  }
});

router.patch('/review/:address', async (req: Request, res: Response) => {
  const  address  = req.params.address as string;
  const { personalInfo, documents } = req.body;
  try {
    const kyc = await adminReview({ address, personalInfo, documents });
    if (!kyc) return res.status(404).json({ message: 'KYC not found' });
    return res.json({ message: 'KYC reviewed successfully', status: kyc.status });
  } catch (error) {
    return res.status(404).json({ message: 'KYC not found' });
  }
});

// admin : change data
router.patch('/admin/update/:address', async (req: Request, res: Response) => {
  const  address  = req.params.address as string;
  try {
    const updated = await adminUpdateKyc({ address: address.toLowerCase(), documents: req.body });
    if (!updated) {
      return res.status(404).json({ message: 'KYC not found' });
    }

    return res.json({
      message: 'KYC updated successfully',
      status: updated.status,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
});

export default router;
