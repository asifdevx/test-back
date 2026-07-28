import axios from "axios";
import FormData from "form-data";
import { API_CALL } from "../config/base";

export async function replaceBase64Images(html: string): Promise<string> {
  const regex = /<img[^>]+src="data:image\/(png|jpeg|jpg|gif|webp);base64,([^"]+)"/g;

  let updatedHtml = html;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const [fullTag, ext, base64Data] = match;

    const buffer = Buffer.from(base64Data, "base64");

    const form = new FormData();
    form.append("file", buffer, {
      filename: `image.${ext}`,
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    });

    const res = await axios.post(`${API_CALL}/upload/collection`, form, {
      headers: form.getHeaders(),
    });

    const imageUrl = `${API_CALL}${res.data.url}`;

    const newTag = fullTag.replace(/src="[^"]+"/, `src="${imageUrl}"`);
    updatedHtml = updatedHtml.replace(fullTag, newTag);
  }

  return updatedHtml;
}

// ─── Mailer (Sender Transactional) ─────────────────
export async function mailer({ to, subject, html, toName = "" }: { to: string; subject: string; html: string; toName?: string }) {
  try {
    const cleanHtml = await replaceBase64Images(html);

    await axios.post(
      "https://api.sequenzy.com/api/v1/transactional/send",
      {
        to,
        subject,
        body: cleanHtml,
        variables: {
          firstName: toName || "",
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SEQUENZY_API_KEY}`,
        },
        timeout: 20000,
      },
    );
  } catch (error: any) {
    console.error("❌ Mailer error:", error);
  }
}

export const sendSMS = async (phone: string, code: string) => {
  const message = `Your verification code is: ${code}`;

  const cleanPhone = phone.replace(/\s+/g, "");
  try {
    await fetch("https://api.smsapi.com/sms.do", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SMSAPI_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.SMSAPI_NAME || "kunstify",
        to: cleanPhone,
        message,
        format: "json",
      }),
    });
  } catch (error) {
    console.error("❌ SMS error:", error);
  }
};
