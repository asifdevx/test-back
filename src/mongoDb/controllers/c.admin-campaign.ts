import { Request, Response } from "express";
import { BASE_URL } from "../../config/base";
import { emailQueue } from "../../redis/queues";
import { MailingList, NewsletterStatus } from "../schemas/sch.mailingList";
import { User } from "../schemas/sch.userProfile";

export const sendMail = async (req: Request, res: Response) => {
  try {
    const { subject, html, countries, packages, isKycRequired } = req.body;

    if (!subject || !html) {
      return res.status(400).json({
        success: false,
        message: "Subject and HTML are required",
      });
    }

    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Packages must be provided",
      });
    }

    // =========================
    // USER PIPELINE (UNCHANGED)
    // =========================
    const pipeline: any[] = [
      {
        $match: {
          isBanned: false,
          profile: { $exists: true, $ne: null },
        },
      },
      {
        $lookup: {
          from: "profiles",
          localField: "profile",
          foreignField: "_id",
          as: "profile",
        },
      },
      { $unwind: "$profile" },
      {
        $match: {
          "profile.email": { $exists: true, $ne: null },
        },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "address",
          foreignField: "address",
          as: "subscription",
        },
      },
      {
        $unwind: {
          path: "$subscription",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    // =========================
    // PACKAGE FILTER
    // =========================
    const packageMatch: any[] = [];

    if (packages.includes("nft")) {
      packageMatch.push({ "subscription.packages.nft": { $ne: null } });
    }

    if (packages.includes("business")) {
      packageMatch.push({
        "subscription.packages.business": { $ne: null },
      });
    }

    if (packageMatch.length > 0) {
      pipeline.push({
        $match: { $or: packageMatch },
      });
    }

    // =========================
    // COUNTRY + KYC FILTER
    // =========================
    if (countries && countries.length > 0) {
      const normalized = countries.map((c: string) => c.toLowerCase());

      pipeline.push({
        $match: {
          $or: [{ "kyc.personalInfo.country": { $in: normalized } }, ...(isKycRequired ? [] : [{ kyc: null }])],
        },
      });
    } else if (isKycRequired) {
      pipeline.push({
        $match: {
          kyc: { $ne: null },
        },
      });
    }

    // =========================
    // FETCH USERS
    // =========================
    const users = await User.aggregate(pipeline);
    const mailingList = await MailingList.find({ status: NewsletterStatus.ACTIVE }, { email: 1, unsubscribeToken: 1 }).lean();

    // =========================
    // BUILD USER EMAILS
    // =========================
    const userEmails = users.map((u: any) => ({
      email: u.profile.email,
      type: "user",
    }));

    // =========================
    // BUILD MAILING EMAILS
    // =========================
    const mailingEmails = mailingList.map((m) => ({
      email: m.email,
      type: "mailing",
      token: m.unsubscribeToken,
    }));

    const map = new Map<string, any>();

    [...userEmails, ...mailingEmails].forEach((item) => {
      map.set(item.email, item);
    });

    const recipients = Array.from(map.values());

    if (recipients.length === 0) {
      return res.json({
        success: true,
        queued: 0,
        message: "No recipients found",
      });
    }

    // =========================
    // QUEUE EMAILS
    // =========================
    await emailQueue.addBulk(
      recipients.map((user) => {
        let finalHtml = html;      
        // =========================
        // ONLY MAILING LIST GETS UNSUBSCRIBE
        // =========================
        if (user.type === "mailing" || user.token) {
          const unsubscribeUrl = `${BASE_URL}/unsubscribe?token=${user.token}`;          
          finalHtml += `
            <hr style="margin-top:40px;border:none;border-top:1px solid #eee;" />

            <p style="font-size:12px;color:#999;text-align:center;margin-top:20px;">
              You are receiving this email because you subscribed to our newsletter.<br/>
              <a href="${unsubscribeUrl}" style="color:#7c3aed;font-weight:600;">
                Unsubscribe
              </a>
            </p>
          `;
        }

        return {
          name: "sendEmail",
          data: {
            to: user.email,
            subject,
            html: finalHtml,
          },
        };
      }),
    );

    return res.json({
      success: true,
      message: `Queued emails for ${recipients.length} recipients`,
    });
  } catch (error) {
    console.error("Campaign error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to queue campaign",
    });
  }
};
