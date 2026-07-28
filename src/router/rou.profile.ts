import express, { Request, Response } from "express";
import { getProfileAvatar, getProfileData, sendVerifyOtpEmailOrPhone, shortUserInfo, updateProfile, verifyVerifiedOtp } from "../mongoDb/controllers/c.profile";
import { Profile } from "../mongoDb/schemas/sch.userProfile";

const router = express.Router();

router.get("/info", async (req: Request, res: Response) => {
  const address = req.query.address as string;
  if (!address) {
    return res.status(400).json({ message: "address is required" });
  }
  try {
    const data = await getProfileData(address);

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: "failed to fatch data " });
  }
});

router.get("/shortInfo", shortUserInfo);

router.get("/check-username/:displayName", async (req: Request, res: Response) => {
  try {
    const { displayName } = req.params;

    const profile = await Profile.findOne({ displayName });

    if (profile) {
      return res.status(200).json({ exists: true, userAddress: profile?.address });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.post("/",updateProfile);

router.get("/getAvatarUrl", getProfileAvatar);
router.post("/send-verifyOtp-email-or-phone",sendVerifyOtpEmailOrPhone)
router.post("/verifyOtp-email-or-phone", verifyVerifiedOtp);
export default router;
