import { ethers } from "ethers";
import { BASE_URL } from "../config/base";
import { PaySubscriptionTxModel, SubscriptionStatus } from "../mongoDb/schemas/sch.paySubscription";
import { PayTx } from "../mongoDb/schemas/sch.payTx";
import { mailer } from "../services/mailer";

type Props = {
  merchantId: string;
  amount: number;
  address: string;
  email: string;
  companyName: string;
  isMonthly: boolean;
};

function getNextBillingDate(isMonthly: boolean): Date {
  const now = new Date();

  if (isMonthly) {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1, // +1 month
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  } else {
    return new Date(
      Date.UTC(
        now.getUTCFullYear() + 1, // +1 year
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }
}
export async function createRecurring({ merchantId, amount, address, email, isMonthly, companyName }: Props): Promise<string> {
  try {
    if (!merchantId || !amount || !address || !email) {
      throw new Error("Missing required fields");
    }
    const sessionId = ethers.keccak256(ethers.randomBytes(32));
    const subscription = await PaySubscriptionTxModel.findOne({ address, status: SubscriptionStatus.ACTIVE });
    if (subscription) throw new Error("User Subscription Running");
    const session = await PayTx.create({
      sessionId,
      merchantId,
      mAmount: amount,
      isSubscription: true,
    });

    await PaySubscriptionTxModel.create({
      merchantId,
      address,
      amount,
      email,
      isMonthly,
      status: SubscriptionStatus.ACTIVE,
      nextBillingDate: getNextBillingDate(isMonthly), // ✅ instead of new Date()
      sessionIds: [session._id],
    });
    const url = `${BASE_URL}/kunstify-pay/checkout?sessionId=${sessionId}`;
    const frequency = isMonthly ? "Monthly" : "Yearly";

    // ✅ Professional HTML Email Template
    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .header { background: #0f172a; padding: 40px 20px; text-align: center; color: #ffffff; }
        .content { padding: 30px; line-height: 1.6; color: #334155; }
        .amount-box { background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; border: 1px solid #e2e8f0; }
        .amount-text { font-size: 32px; font-weight: bold; color: #7c3aed; margin: 0; }
        .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px; }
        .button { display: inline-block; padding: 16px 32px; background-color: #7c3aed; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; background: #f8fafc; border-top: 1px solid #e2e8f0; }
        .wallet-text { font-family: monospace; font-size: 11px; background: #eee; padding: 4px 8px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0; font-size: 24px;">Action Required</h1>
          <p style="margin:10px 0 0; color: #94a3b8; font-size: 14px;">Recurring Payment Setup via Kunstify Pay</p>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p><strong>${companyName}</strong> has requested to set up a <strong>${frequency}</strong> subscription with your wallet.</p>
          
          <div class="amount-box">
            <div class="label">Subscription Amount</div>
            <div class="amount-text">${amount} DOZ</div>
            <div style="font-size: 14px; color: #64748b;">Billed ${frequency}</div>
          </div>

          <p>To authorize this subscription and process your first payment, please click the button below to go to our secure checkout:</p>
          
          <div style="text-align: center;">
            <a href="${url}" class="button">Confirm & Pay Now</a>
          </div>

          <p style="font-size: 14px;"><strong>Target Wallet:</strong> <br/>
          <span class="wallet-text">${address}</span></p>

          <p style="font-size: 13px; color: #64748b; margin-top: 30px;">
            If you did not expect this request, you can safely ignore this email. This link will expire after the transaction is completed.
          </p>
        </div>
        <div class="footer">
          &copy; 2026 Kunstify Pay Protocol. All rights reserved.<br/>
          Secure Blockchain Payments for ${companyName}.
        </div>
      </div>
    </body>
    </html>
    `;
    await mailer({
      to: email,
      subject: `Action Required: Confirm your ${amount} DOZ Subscription for ${companyName}`,
      html: emailHtml,
    });
    return `${BASE_URL}/kunstify-pay/checkout?sessionId=${sessionId}`;
  } catch (error:any) {
    console.error("createRecurring error:", error);

    throw new Error(error?.message || "Failed to create recurring subscription");
  }
}
