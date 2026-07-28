import crypto from "crypto";


export const generateKey = (prefix: string) => {
  return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
};

export const hashValue = (value: string) => {
  return crypto.createHash("sha256").update(value).digest("hex");
};
