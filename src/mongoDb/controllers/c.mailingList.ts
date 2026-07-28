import crypto from "crypto";
import { Request, Response } from "express";
import { sendConfirmationEmail } from "../../utils/emailTemplet";
import { MailingList, NewsletterStatus } from "../schemas/sch.mailingList";
import { Profile } from "../schemas/sch.userProfile";

export async function addMailToList(req: Request, res: Response) {
  try {
    const { email, address } = req.body;

    // 🔹 Basic validation
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    if (!address) {
      return res.status(400).json({ success: false, message: "Wallet address required" });
    }

    const normalizedEmail = email.toLowerCase();

    // 🔹 Check in Profile (already active user email)
    const profileUser = await Profile.findOne({
      email: normalizedEmail,
    });

    if (profileUser) {
      return res.status(200).json({
        success: false,
        message: "Already subscribed (profile)",
      });
    }

    // 🔹 Check MailingList
    const existing = await MailingList.findOne({ email: normalizedEmail });

    if (existing) {
      if (existing.status === "active") {
        return res.status(200).json({
          success: false,
          message: "Already subscribed",
        });
      }

      // 🔁 Pending → regenerate token
      const token = crypto.randomBytes(48).toString("hex");

      existing.confirmToken = token;
      existing.tokenExpires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
      await existing.save();

      await sendConfirmationEmail(normalizedEmail, token);

      return res.status(200).json({
        success: true,
        message: "Confirmation email resent",
      });
    }

    // 🆕 New subscription
    const token = crypto.randomBytes(48).toString("hex");

    await MailingList.create({
      email: normalizedEmail,
      status: NewsletterStatus.PENDING,
      confirmToken: token,
      tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    await sendConfirmationEmail(normalizedEmail, token);

    return res.status(201).json({
      success: true,
      message: "Confirmation email sent",
    });
  } catch (error: any) {
    console.error("Newsletter Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
}

export async function confirmSubscription(req: Request, res: Response) {
  try {
    const { token } = req.body;

    const subscriber = await MailingList.findOne({
      confirmToken: token,
      tokenExpires: { $gt: new Date() },
    });

    if (!subscriber) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // already active (idempotent)
    if (subscriber.status === "active") {
      return res.json({
        success: true,
        message: "Already confirmed",
      });
    }
    const unsubscribeToken = crypto.randomBytes(48).toString("hex");
    subscriber.unsubscribeToken = unsubscribeToken;
    subscriber.status = NewsletterStatus.ACTIVE;
    subscriber.confirmToken = undefined;
    subscriber.tokenExpires = undefined;
    subscriber.verifiedAt = new Date();

    await subscriber.save();

    return res.json({
      success: true,
      message: "Subscription confirmed",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

export const unsubscribe = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const user = await MailingList.findOne({
      unsubscribeToken: token,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired link",
      });
    }

    if (user.status === NewsletterStatus.UNACTIVE) {
      return res.json({
        success: true,
        message: "Already unsubscribed",
      });
    }

    user.status = NewsletterStatus.UNACTIVE;
    await user.save();

    return res.json({
      success: true,
      message: "Successfully unsubscribed",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};