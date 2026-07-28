import crypto from "crypto";
import { verifyMessage } from "ethers";
import jwt from "jsonwebtoken";
import env from "../constant/env";
import { UserRoles } from "../mongoDb/schemas/sch.userProfile";
import { UserPayload } from "../types";

const JWT_SECRET = env.jwt_secret;

/**
 * Generate a unique message for user to sign
 * This prevents replay attacks
 */
export const generateSignatureMessage = (address: string, nonce: string) => {
  return `Welcome to Kunstify!\n\nPlease sign this message to prove you own this wallet.\n\nWallet: ${address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
};

/**
 * Generate a random nonce (one-time use)
 */
export const generateNonce = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Verify the wallet signature using ethers.js
 * @param message - The message that was signed
 * @param signature - The signature (from wallet)
 * @returns The address that signed the message
 */
export const verifySignature = async (message: string, signature: string): Promise<string> => {
  
  
  try {
    const recoveredAddress = verifyMessage(message, signature);
    
    return recoveredAddress.toLowerCase();
  } catch (error) {
      throw new Error("Invalid signature");
  }
};

/**
 * Create JWT token (session token)
 */
export const createJWT = (address: string, role: UserRoles =UserRoles.USER): { token: string; expiresIn: string } => {
  const token = jwt.sign(
    {
      address: address.toLowerCase(),
      role,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: "7d" }, // Token valid for 7 days
  );

  return { token, expiresIn: "7d" };
};

/**
 * Verify JWT token
 */
export const verifyJWT = (token: string): UserPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    return {
      address: decoded.address.toLowerCase(),
      role: decoded.role,
      isAdmin: ["admin","moderator"].includes(decoded.role.toLowerCase()),
      token,
      nonce: decoded.nonce || "",
      iat: decoded.iat,
    };
  } catch (error) {
    return null;
  }
};

/**
 * Refresh JWT token (extend session)
 */
export const refreshJWT = (token: string): string | null => {
  const decoded = verifyJWT(token);
  if (!decoded) return null;

  const newToken = jwt.sign(
    {
      address: decoded.address,
      role: decoded.role,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );

  return newToken;
};
