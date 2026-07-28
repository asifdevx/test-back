import { BASE_URL } from "../config/base";
import { mailer } from "../services/mailer";

export const packageExpiredEmail = ({
  type,
  name,
  planName,
  expiryDate,
}: {
  type: "reminder5" | "expireToday" | "expired" | "pastDue" | "suspended";
  name: string;
  planName: string;
  expiryDate?: string; // Pass the actual expiry date from the cron
}) => {
  const renewLink = `https://kunstify.io/pricing?mode=nft`;

  // Type-specific configurations
  const config = {
    reminder5: {
      emoji: "⏰",
      color: "#3b82f6", // Blue
      urgency: "Upcoming",
      heading: "Your plan is expiring soon",
      message: `Your <strong>${planName}</strong> will expire in <strong>5 days</strong>. Renew now to keep your premium features.`,
      buttonText: "Renew My Plan",
      buttonColor: "#3b82f6",
    },
    expireToday: {
      emoji: "⚠️",
      color: "#f59e0b", // Amber
      urgency: "Expires Today",
      heading: "Your plan expires today!",
      message: `Your <strong>${planName}</strong> expires at midnight tonight. Don't lose access to your premium features.`,
      buttonText: "Renew Now",
      buttonColor: "#f59e0b",
    },
    expired: {
      emoji: "❌",
      color: "#ef4444", // Red
      urgency: "Expired",
      heading: "Your plan has expired",
      message: `Your <strong>${planName}</strong> expired yesterday. Renew within 2 days to avoid account suspension.`,
      buttonText: "Renew Immediately",
      buttonColor: "#ef4444",
    },
    pastDue: {
      emoji: "🚨",
      color: "#dc2626", // Dark red
      urgency: "Payment Past Due",
      heading: "Immediate action required",
      message: `Your account is <strong>2 days overdue</strong> for <strong>${planName}</strong>. Your account will be suspended in 1 day.`,
      buttonText: "Pay Now to Avoid Suspension",
      buttonColor: "#dc2626",
    },
    suspended: {
      emoji: "🔒",
      color: "#991b1b", // Darker red
      urgency: "Account Suspended",
      heading: "Your account has been suspended",
      message: `Your <strong>${planName}</strong> has been suspended and downgraded to <strong>FREE</strong>. Renew now to restore your premium features.`,
      buttonText: "Restore My Account",
      buttonColor: "#991b1b",
    },
  }[type];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${config.heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  
  <!-- Main Container -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        
        <!-- Email Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:white;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:600px;width:100%;">
          
          <!-- Header with Urgency Badge -->
          <tr>
            <td style="padding:32px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="https://kunstify.io/img/logo2.png" alt="Kunstify" width="140" style="display:block;" />
                  </td>
                  <td align="right">
                    <span style="
                      background-color:${config.color};
                      color:white;
                      padding:6px 14px;
                      border-radius:20px;
                      font-size:12px;
                      font-weight:600;
                      text-transform:uppercase;
                      letter-spacing:0.5px;
                    ">${config.urgency}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;">
              
              <!-- Emoji Icon -->
              <div style="font-size:48px;margin-bottom:16px;">${config.emoji}</div>
              
              <!-- Greeting -->
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#111827;line-height:1.2;">
                Hi ${name},
              </h1>
              
              <!-- Heading -->
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#374151;">
                ${config.heading}
              </h2>
              
              <!-- Message -->
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b5563;">
                ${config.message}
              </p>

              ${
                expiryDate
                  ? `
              <!-- Expiry Date Box -->
              <div style="
                background-color:#f9fafb;
                border-left:4px solid ${config.color};
                padding:16px 20px;
                margin-bottom:24px;
                border-radius:4px;
              ">
                <p style="margin:0;font-size:14px;color:#6b7280;">
                  <strong style="color:#111827;">Expiry Date:</strong> ${expiryDate}
                </p>
              </div>
              `
                  : ""
              }

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${renewLink}" style="
                      display:inline-block;
                      background-color:${config.buttonColor};
                      color:white;
                      padding:16px 40px;
                      border-radius:8px;
                      text-decoration:none;
                      font-weight:600;
                      font-size:16px;
                      box-shadow:0 4px 6px rgba(0,0,0,0.1);
                      transition:all 0.3s ease;
                    ">${config.buttonText}</a>
                  </td>
                </tr>
              </table>

              ${
                type !== "suspended"
                  ? `
              <!-- Warning Notice -->
              <div style="
                background-color:#fef3c7;
                border:1px solid #fbbf24;
                border-radius:8px;
                padding:16px 20px;
                margin-bottom:24px;
              ">
                <p style="margin:0;font-size:14px;color:#92400e;line-height:1.5;">
                  <strong>⚠️ Important:</strong> If not renewed, your plan will be downgraded to <strong>FREE</strong> and you'll lose access to premium features.
                </p>
              </div>
              `
                  : ""
              }

              <!-- Benefits Reminder -->
              <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb;">
                <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827;">
                  What you'll keep with renewal:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#4b5563;">
                      ✅ All premium features and tools
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#4b5563;">
                      ✅ Priority customer support
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#4b5563;">
                      ✅ Advanced analytics and insights
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#4b5563;">
                      ✅ Unlimited access to all resources
                    </td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;background-color:#f9fafb;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5;">
                Need help? Contact our support team at <a href="https://kunstify.io/support" style="color:${config.color};text-decoration:none;">support</a>
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Kunstify. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        
      </td>
    </tr>
  </table>

</body>
</html>
  `;
};

export const merchantSubscriptionEmail = ({
  type,
  name,
  companyName,
  amount,
  nextBillingDate,
  checkoutUrl,
}: {
  type: "reminder5" | "expireToday" | "expired" | "pastDue" | "suspended";
  name: string;
  companyName: string;
  amount: number;
  nextBillingDate?: string;
  checkoutUrl?: string;
}) => {
  // Configuration per Status
  const config = {
    reminder5: {
      emoji: "⏰",
      color: "#7c3aed",
      urgency: "Upcoming",
      heading: "Subscription Renewal",
      message: `Your subscription for <strong>${companyName}</strong> will renew in 5 days. Ensure your wallet has sufficient funds.`,
      buttonText: "Review Subscription",
    },
    expireToday: {
      emoji: "⚠️",
      color: "#f59e0b",
      urgency: "Due Today",
      heading: "Payment Due Today",
      message: `Your payment of <strong>${amount} DOZ</strong> to <strong>${companyName}</strong> is due today.`,
      buttonText: "Pay Now",
    },
    expired: {
      emoji: "❌",
      color: "#ef4444",
      urgency: "Overdue",
      heading: "Payment Overdue",
      message: `Your payment to <strong>${companyName}</strong> was missed. Please settle the balance to avoid service interruption.`,
      buttonText: "Settle Payment",
    },
    pastDue: {
      emoji: "🚨",
      color: "#dc2626",
      urgency: "Urgent",
      heading: "Immediate Action Required",
      message: `Your account is 2 days overdue for <strong>${companyName}</strong>. Service will be suspended within 24 hours.`,
      buttonText: "Pay Immediately",
    },
    suspended: {
      emoji: "🔒",
      color: "#111827",
      urgency: "Suspended",
      heading: "Service Suspended",
      message: `Your subscription with <strong>${companyName}</strong> has been suspended.`,
       },
  }[type];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          
          <!-- Header Section -->
          <tr>
            <td style="background-color:#0f172a;padding:40px;text-align:center;">
              <table role="presentation" width="100%">
                <tr>
                  <td align="left">
                     <img src="https://kunstify.io/img/logo2.png" alt="Kunstify" width="140" style="display:block;" />

                  </td>
                  <td align="right">
                    <span style="background-color:${config.color};color:#ffffff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                      ${config.urgency}
                    </span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:30px 0 0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.02em;text-align:left;">
                ${config.heading}
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:40px;">
              <div style="font-size:40px;margin-bottom:20px;">${config.emoji}</div>
              <p style="margin:0 0 16px;font-size:18px;color:#1e293b;font-weight:600;">Hi ${name},</p>
              <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
                ${config.message}
              </p>

              <!-- Transaction Summary Card -->
              <table role="presentation" width="100%" style="background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:30px;">
                <tr>
                  <td style="padding:24px;">
                    <table role="presentation" width="100%">
                      <tr>
                        <td style="padding-bottom:12px;">
                          <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;">Merchant</div>
                          <div style="font-size:16px;color:#0f172a;font-weight:600;">${companyName}</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;border-top:1px solid #e2e8f0;padding-top:12px;">
                          <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;">Amount Due</div>
                          <div style="font-size:24px;color:#7c3aed;font-weight:800;">${amount} <span style="font-size:14px;font-weight:600;">DOZ</span></div>
                        </td>
                      </tr>
                      ${
                        nextBillingDate
                          ? `
                      <tr>
                        <td style="border-top:1px solid #e2e8f0;padding-top:12px;">
                          <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;">Due Date</div>
                          <div style="font-size:15px;color:#0f172a;font-weight:500;">${nextBillingDate}</div>
                        </td>
                      </tr>`
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
            ${
              type !== "suspended" && checkoutUrl
                ? `
  <!-- CTA Button -->
              <table role="presentation" width="100%">
                <tr>
                  <td align="center">
                    <a href="${checkoutUrl}" style="display:inline-block;background-color:${config.color};color:#ffffff;padding:18px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                      ${config.buttonText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
`
                : ""
            }

              <p style="margin:30px 0 0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.5;">
                Securely processed by <strong>Kunstify Pay Protocol</strong>.<br/>
                If you did not authorize this subscription, please contact support.
              </p>
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="padding:30px 40px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 10px;font-size:12px;color:#64748b;font-weight:500;">
                Need help? <a href="https://kunstify.io/support" style="color:#7c3aed;text-decoration:none;">Visit Support Center</a>
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                © ${new Date().getFullYear()} Kunstify. Licensed payment infrastructure.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};
export const reimbursementDemandEmail = ({ merchantName, amountDoz, sessionId, checkoutUrl }: { merchantName: string; amountDoz: string | number; sessionId: string; checkoutUrl: string }) => {
  const deadline = new Date(Date.now() + 30 * 60000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const config = {
    color: "#dc2626", // Urgent Red
    badge: "Final Legal Demand",
    heading: "Immediate Reimbursement Required",
    emoji: "⚖️",
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Legal Notice: Reimbursement Required</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:white;border-radius:12px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);max-width:600px;width:100%;border: 1px solid #fee2e2;">
          
          <tr>
            <td style="padding:32px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="https://kunstify.io/img/logo2.png" alt="Kunstify" width="140" style="display:block;" />
                  </td>
                  <td align="right">
                    <span style="background-color:${config.color};color:white;padding:6px 14px;border-radius:6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">${config.badge}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px;">
              <div style="font-size:48px;margin-bottom:16px;">${config.emoji}</div>
              
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#111827;line-height:1.2;">
                Notice to Merchant: ${merchantName}
              </h1>
              
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b5563;">
                Our compliance team has completed a formal verification of a user complaint regarding <strong>Session ID: ${sessionId}</strong>. 
                Because you failed to issue a refund as per our Merchant Agreement, <strong>Kunstify Pay has covered this refund on your behalf.</strong>
              </p>

              <div style="background-color:#fef2f2;border:1px solid #fee2e2;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
                <p style="margin:0;font-size:14px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                   Reimbursement Deadline: ${deadline} (30 Minutes)
                </p>
              </div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background-color:#f9fafb;border-radius:8px;padding:16px;">
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#6b7280;">Debt Owed to Platform:</td>
                  <td align="right" style="padding:4px 0;font-size:16px;font-weight:800;color:#111827;">${amountDoz} DOZ</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#6b7280;">Currency Unit:</td>
                  <td align="right" style="padding:4px 0;font-size:13px;font-weight:600;color:#4b5563;">DOZ Token</td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${checkoutUrl}" style="background-color:#111827;color:white;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">Settle Outstanding Balance</a>
                  </td>
                </tr>
              </table>

              <div style="border-top:1px solid #e5e7eb;padding-top:24px;">
                <p style="margin:0;font-size:13px;color:#dc2626;line-height:1.6;font-weight:600;">
                  ⚠️ Failure to settle this balance by ${deadline} will result in immediate termination of your merchant facilities and the initiation of legal recovery proceedings through our legal counsel. 
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 32px;background-color:#f9fafb;border-radius:0 0 12px 12px;">
              <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
                © ${new Date().getFullYear()} Kunstify Legal Department. This is a formal financial demand.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;
};

export const sendReplyEmail = async ({ userEmail, userName, adminMessage }: { userEmail: string; userName: string; adminMessage: string }) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e4e4e7; }
        .header { background: #7c3aed; padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: -0.025em; }
        .content { padding: 40px; color: #27272a; line-height: 1.6; }
        .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #18181b; }
        .message-box { background: #f9fafb; border-left: 4px solid #7c3aed; padding: 20px; margin: 24px 0; border-radius: 4px; color: #52525b; font-style: italic; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #a1a1aa; background: #fafafa; }
        .button { display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Kunstify Support</h1>
        </div>
        <div class="content">
          <div class="greeting">Hi ${userName || "there"},</div>
          <p>We have replied to your inquiry. Here is the update from our support team:</p>
          
          <div class="message-box">
            "${adminMessage}"
          </div>
          
          <p>If you have further questions, Give message on Contact.</p>
          
          <a href="https://kunstify.io/contact" class="button">Contact Us</a>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Kunstify Inc. All rights reserved.<br>
          123 NFT Street, Crypto City.
        </div>
      </div>
    </body>
    </html>
  `;

  await mailer({
    to: userEmail,
    subject: `Kunstify Support Reply to Your Inquiry`,
    html: htmlContent,
  });
};

export const otpEmailTemplate = (otp: string) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>OTP Verification</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:40px 0;">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
              
              <tr>
                <td style="padding:24px; text-align:center; background:#0f172a; color:#ffffff;">
                  <h2 style="margin:0;">Verification Code</h2>
                </td>
              </tr>

              <tr>
                <td style="padding:32px; color:#333333;">
                  <p style="font-size:16px; margin:0 0 16px;">
                    Your One-Time Password ${otp} is:
                  </p>

                  <p style="font-size:32px; font-weight:bold; letter-spacing:6px; text-align:center; margin:24px 0;">
                    ${otp}
                  </p>

                  <p style="font-size:14px; color:#555;">
                    This code will expire in <strong>5 minutes</strong>.
                  </p>

                  <p style="font-size:14px; color:#999; margin-top:24px;">
                    If you did not request this code, please ignore this email.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:16px; text-align:center; background:#f1f5f9; font-size:12px; color:#777;">
                  © ${new Date().getFullYear()} Kunstify. All rights reserved.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

export const businessKycReviewTemplet = async ({ status, user, companyName }: { status: string; user: any; companyName: string }) => {
  const statusColor = status === "approved" ? "#16a34a" : "#dc2626";
  const statusBg = status === "approved" ? "#ecfdf5" : "#fef2f2";
  const statusText = status === "approved" ? "Your KYC has been approved" : "Your KYC has been rejected";

  const message =
    status === "approved"
      ? "Congratulations! Your business account is now verified and fully activated."
      : "Unfortunately, your KYC verification was not approved. Please review your details and try again.";

  const actionText = status === "approved" ? "You now have access to merchant features, payouts, and integrations." : "Please update your documents or business details and resubmit for review.";

  await mailer({
    to: user.email,
    subject: statusText,
    html: `
  <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:30px;">
    <div style="max-width:600px; margin:auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.08);">

      <!-- HEADER -->
      <div style="background:${statusColor}; padding:20px; text-align:center; color:#fff;">
        <h1 style="margin:0; font-size:20px;">Kunstify Verification</h1>
      </div>

      <!-- BODY -->
      <div style="padding:30px; color:#111827;">

        <h2 style="margin-bottom:10px;">Hello ${user.displayName || "User"},</h2>

        <div style="padding:15px; background:${statusBg}; border-left:5px solid ${statusColor}; border-radius:8px; margin:20px 0;">
          <strong>${statusText}</strong>
        </div>

        <p style="font-size:15px; line-height:1.6;">
          ${message}
        </p>

        <p style="font-size:14px; color:#4b5563; line-height:1.6;">
          ${actionText}
        </p>

        <!-- DETAILS BOX -->
        <div style="margin-top:25px; padding:15px; background:#f9fafb; border-radius:10px; font-size:14px;">
          <p><b>Company:</b> ${companyName}</p>
          <p><b>Status:</b> ${status.toUpperCase()}</p>
          <p><b>Reviewed At:</b> ${new Date().toLocaleDateString()}</p>
        </div>

        <!-- BUTTON -->
        <div style="text-align:center; margin-top:30px;">
          <a href="https://kunstify.io/kunstify-pay"
             style="background:${statusColor}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:bold;">
            Go to Dashboard
          </a>
        </div>

      </div>

      <!-- FOOTER -->
      <div style="text-align:center; padding:20px; font-size:12px; color:#6b7280;">
        © ${new Date().getFullYear()} Kunstify. All rights reserved.
      </div>

    </div>
  </div>
  `,
  });
};

export const sendConfirmationEmail = async (to: string, token: string) => {
  const confirmUrl = `${BASE_URL}/confirm-subscription?token=${token}`;
  const htmlContent = `
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Subscription</title>
  <style>
    /* Basic Reset */
    body { margin: 0; padding: 0; background-color: #f9fafb; font-family: 'Inter', -apple-system, sans-serif; }
    table { border-spacing: 0; width: 100%; }
    img { border: 0; }
    
    /* Responsive */
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 20px !important; }
      .header-image { width: 100% !important; height: auto !important; }
    }
  </style>
</head>
<body>
  <table role="presentation" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); border: 1px solid #e5e7eb;">
          
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: left;">
              <img src="https://kunstify.io/img/logo2.png" alt="Kunstify Logo" width="120" style="display: block;">
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <h1 style="color: #111827; font-size: 28px; font-weight: 800; margin: 0 0 16px 0; letter-spacing: -0.5px;">
                Almost there! 🚀
              </h1>
              <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin: 0 0 32px 0;">
                Thanks for signing up for the Kunstify newsletter. To start receiving exclusive drops, community alerts, and early access content, we just need to verify your email address.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
                <tr>
                  <td align="center" style="border-radius: 14px; background: linear-gradient(to right, #7c3aed, #4f46e5);">
                  <a 
  href="${confirmUrl}" 
  target="_blank"
  style="
    display:inline-block;
    padding:14px 28px;
    font-size:15px;
    font-weight:600;
    color:#ffffff;
    text-decoration:none;
    border-radius:8px;
    background:linear-gradient(135deg,#7c3aed,#4f46e5);
    box-shadow:0 4px 14px rgba(79,70,229,0.4);
  "
>
  Verify My Email
</a>
                  </td>
                </tr>
              </table>

              <p style="color: #9ca3af; font-size: 14px; line-height: 20px; margin: 0;">
                If you didn't request this, you can safely ignore this email. This link will expire in 24 hours.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 40px; background-color: #f3f4f6; border-top: 1px solid #e5e7eb; text-align: center;">
              
              <p style="color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0;">
                &copy; 2026 Kunstify. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await mailer({ to, subject: "Get latest new of kunstify", html: htmlContent });
};
