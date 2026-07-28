import { Request, Response } from "express";
import { mailer, sendSMS } from "../../services/mailer";
import { otpEmailTemplate } from "../../utils/emailTemplet";
import { Kyc } from "../schemas/kyc.schema";
import { OTP } from "../schemas/otp.schema";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
import { Profile, User } from "../schemas/sch.userProfile";

type Mode = "email" | "sms";
export const getProfileData = async (address: string) => await Profile.findOne({ address: address.toLowerCase() });

export const getProfileAvatar = async (req: Request, res: Response) => {
  const { address } = req.query;

  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "No address provided" });
  }
  const lowerSeller = address.toLowerCase();
  const data = await Profile.findOne({ address: lowerSeller }, { avatarUrl: 1 });
  if (!data) return res.status(400).json({ error: "no data found" });
  return res.status(200).json(data);
};

export const updateProfile = async (req: Request, res: Response) => {
  const { address, profileData, method } = req.body;

  if (!address || !profileData) return res.status(400).json({ message: "address required" });

  try {
    const normalized = address.toLowerCase();

    const updateData: any = {
      ...profileData,
      updatedAt: new Date(),
    };
    // Generate verification flags based on method
    if (method === "sms") {
      updateData.mobileVerify = true;
    } else if (method === "email") {
      updateData.emailVerify = true;
    }

    const profile = await Profile.findOneAndUpdate({ address: normalized }, { $set: updateData }, { new: true, upsert: true });

    await User.findOneAndUpdate(
      { address: normalized },
      {
        $set: {
          isFirstTime: false,
          name: profileData.displayName,
          profile: profile._id,
        },
      },
      { new: true },
    );
    return res.json({ message: "Update Profile" });
  } catch (error) {
    return res.status(500).json({ message: "Server Error" });
  }
};

export const getUserFullInfo = async (address: string) => {
  const normalized = address.toLowerCase();

  const [profile, kyc, subscription] = await Promise.all([
    Profile.findOne({ address: normalized }).lean(),
    Kyc.findOne({ address: normalized }).lean(),
    SubscriptionModel.findOne({ address: normalized }).lean(),
  ]);

  const nftPkgId = subscription?.packages?.nft?.pkgId ?? 0;

  return {
    profile: {
      ...(profile || {}),
      package: nftPkgId, // ✅ inject here
    },
    kyc,
  };
};

export const shortUserInfo = async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;

    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "No address provided" });
    }
    const lowerSeller = address?.toLowerCase();

    const data = await Profile.findOne({ address: lowerSeller }).select({ displayName: 1, avatarUrl: 1 });

    if (!data) {
      return res.status(404).json({ error: "No user found" });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export async function sendVerifyOtpEmailOrPhone(req: Request, res: Response) {
  try {
    const { address, type } = req.body as { address: string; type: Mode };
    const normalized = address?.toLowerCase();
    if (!address) return res.status(404).json({ message: "Address Required" });
    const [profileData, existingOtp] = await Promise.all([Profile.findOne({ address: normalized }), OTP.findOne({ address: normalized })]);

    if (!profileData) return res.status(404).json({ message: "No Profile Found" });
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry
    if (!existingOtp) throw new Error("Failed To Genaret Opt");

    existingOtp.otp = otpCode;
    existingOtp.expiresAt = expiresAt;
    existingOtp.attempts = 0;
    existingOtp.verified = false;
    await existingOtp.save();

    if (type === "email") {
      await mailer({
        to: profileData?.email!,
        subject: "Your OTP Verification Code",
        html: otpEmailTemplate(otpCode),
      });
    } else {
      await sendSMS(profileData?.mobile, otpCode);
    }
    return res.status(201).json({ message: "OTP Send" });
  } catch (error) {
    return res.status(500).json({ message: "Server Error " });
  }
}
export async function verifyVerifiedOtp(req: Request, res: Response) {
  try {
    const address = (req.body.address as string)?.toLowerCase();
    const { otp, type } = req.body as {
      otp: string;
      type: Mode;
    };

    if (!address || !otp) {
      return res.status(400).json({
        success: false,
        message: "Address and OTP are required",
      });
    }

    let [profileData, record] = await Promise.all([Profile.findOne({ address }), OTP.findOne({ address })]);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "OTP record not found",
      });
    }

    // Expiry check
    if (record.expiresAt && record.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: "OTP expired",
      });
    }

    // Attempt limit check
    if (record.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "Maximum verification attempts reached",
      });
    }

    // OTP match check
    if (record.otp !== otp) {
      record.attempts += 1;
      await record.save();

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
        attempts: record.attempts,
      });
    }

    if (!profileData) throw new Error("No Profile Found");
    if (type === "email") {
      profileData.emailVerify = true;
    } else {
      profileData.mobileVerify = true;
    }
    // Success
    record.verified = true;
    await record.save();
    await profileData.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error",
    });
  }
}
