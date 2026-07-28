import { Request, Response } from "express";
import { mailer, sendSMS } from "../../services/mailer";
import { otpEmailTemplate } from "../../utils/emailTemplet";
import { OTP } from "../schemas/otp.schema";
import { Profile } from "../schemas/sch.userProfile";

export const sendOTP = async (req: Request, res: Response) => {
  try {
    const { address, email, phone, type } = req.body;
    
    
    if (!address || !email) {
      return res.status(400).json({ message: "address & email required" });
    }
    const contact = type === "sms" ? phone : email;
    const wallet = address.toLowerCase();
    const normalizedContact = contact.toLowerCase();
    if (type === "email") {
      const existingProfile = await Profile.findOne({
        email: normalizedContact,
        address: { $ne: wallet },
      });

      if (existingProfile) {
        return res.status(409).json({
          message: "This email is already Used",
        });
      }
    }

    if (phone) {
      const existingProfile = await Profile.findOne({
        mobile: phone,
        address: { $ne: wallet },
      });

      if (existingProfile) {
        return res.status(409).json({
          message: "This Phone number is already Used",
        });
      }
    }
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    const existingOtp = await OTP.findOne({ address: wallet });

    if (existingOtp) {
      existingOtp.email = type === "email" ? normalizedContact : existingOtp.email;
      existingOtp.otp = otpCode;
      existingOtp.expiresAt = expiresAt;
      existingOtp.attempts = 0;
      await existingOtp.save();
    } else {
      await OTP.create({
        address: wallet,
        email,
                otp: otpCode,
        expiresAt,
      });
    }

    if (type === "email") {
      await mailer({
        to: normalizedContact,
        subject: "Your OTP Verification Code",
        html: otpEmailTemplate(otpCode),
      });
    } else {
      await sendSMS(normalizedContact, otpCode);
    }

    return res.json({ message: "Send Otp" });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || "failed to Send" });
  }
};
export const verifyOTP = async (address: string, email: string, otp: string) => {
  const record = await OTP.findOne({
    address: address.toLowerCase(),
    email: email.toLowerCase(),
  });

  if (!record) return { success: false, message: "Failed" };

  if (record.expiresAt && record.expiresAt < new Date()) throw new Error("OTP expired");

  if (record.attempts >= 5) return { success: false, message: "Maximum verification attempts reached" };

  if (record.otp === otp) {
    record.verified = true;

    await record.save();
    return { success: true, message: "OTP verified successfully" };
  } else {
    record.attempts += 1;
    await record.save();
    return { success: false, message: "Invalid OTP", attempts: record.attempts };
  }
};
