import { Request, Response } from 'express';
import { User } from '../schemas/sch.userProfile';

/**
 * @GET /api/user/session
 */
export const getUserData = async (req: Request, res: Response) => {
  try {
    const address = String(req.query.address || '').toLowerCase();
   
    
    if (!address) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let user = await User.findOne({ address }).select('address name role package isFirstTime isVerified isBanned lastLoginAt');

    if (!user) {
      // Create a new user automatically for first-time wallet
      user = await User.create({
        address,
        role: 'user',
        package: 0,
        isFirstTime: true,
        isVerified: false,
        isBanned: false,
        lastLoginAt: new Date(),
      });
    } else {
      // Update lastLoginAt only if > 10 min
      const TEN_MIN = 10 * 60 * 1000;
      if (!user.lastLoginAt || Date.now() - user.lastLoginAt.getTime() > TEN_MIN) {
        user.lastLoginAt = new Date();
        await user.save();
      }
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user' });
  }
};


/**
 *@PATCH /api/user
 */
export const updateUserInfo = async (req: Request, res: Response) => {
  try {
    const address = String(req.query.address || '').toLowerCase();
    const { name } = req.body;

    if (!address) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Invalid name' });
    }

    const user = await User.findOneAndUpdate({ address }, { $set: { name } }, { new: true }).select('address name role package isFirstTime isVerified isBanned');

    res.json(user);
  } catch {
    res.status(500).json({ message: 'Update failed' });
  }
};

/**
 * @POST /api/user/onboarding-complete
 */
export const completeOnboarding = async (req: Request, res: Response) => {
  try {
    const address = String(req.query.address || '').toLowerCase();

    if (!address) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    await User.updateOne({ address }, { $set: { isFirstTime: false } });

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: 'Failed to complete onboarding' });
  }
};
