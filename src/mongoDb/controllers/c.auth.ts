//controllers/c.auth.ts
import { CookieOptions, Request, Response } from "express";
import { redis } from "../../config/redis";
import env from "../../constant/env";
import { createJWT, generateNonce, generateSignatureMessage, refreshJWT, verifySignature } from "../../utils/web-auth";
import { SubscriptionModel } from "../schemas/sch.user-subscription";
import { User } from "../schemas/sch.userProfile";

const NONCE_EXPIRY = 15 * 60; // 10 Minutes

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.node_env === "production",
  sameSite: env.node_env === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};
/**
 * @POST /auth/request-message
 * Generate a message for user to sign
 * Frontend will sign this with wallet
 *
 * Body: { address: "0x..." }
 */
export async function requestMessage(req: Request, res: Response) {
  const address = (req.body.address || "").toLowerCase();

  try {
    if (!address || !address.startsWith("0x") || address.length !== 42) {
      return res.status(400).json({
        message: "Invalid Ethereum address",
        code: "INVALID_ADDRESS",
      });
    }
    // Genaret Unique nonce
    const nonce = generateNonce();

    // Store nonce into Redis with expire
    await redis.setex(`nonce:${address}`, NONCE_EXPIRY, nonce);

    // Genaret Message Sign
    const message = generateSignatureMessage(address, nonce);

    return res.json({ message, nonce, expiresIn: NONCE_EXPIRY });
  } catch (error) {
    console.error("Error requesting message:", error);
    return res.status(500).json({ message: "Failed to generate message", code: "REQUEST_ERROR" });
  }
}

/**
 * @POST /auth/verify-signature
 * Verify the signed message and issue JWT token
 *
 * Body: {
 *   address: "0x...",
 *   signature: "0x...",
 *   message: "Welcome to Kunstify..."
 * }
 *
 * Returns: { token: "eyJ...", user: {...} }
 */

export async function verifyAndSignIn(req: Request, res: Response) {
  try {
    const { address, signature, message } = req.body;

    // Validate inputs
    if (!address || !signature || !message) {
      return res.status(400).json({
        message: "Missing required fields: address, signature, message",
        code: "MISSING_FIELDS",
      });
    }
    const lowerAddress = address.toLowerCase();

    // Check if nonce exists in Redis (not expired and valid)
    const storedNonce = await redis.get(`nonce:${lowerAddress}`);
    if (!storedNonce) {
      return res.status(401).json({
        message: "Invalid or expired nonce",
        code: "INVALID_NONCE",
      });
    }

    // Delete nonce immediately to prevent replay attacks
    await redis.del(`nonce:${lowerAddress}`);

    // Verify the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = await verifySignature(message, signature);
    } catch (error) {
      return res.status(401).json({
        message: "Signature verification failed",
        code: "INVALID_SIGNATURE",
      });
    }

    // Check if recovered address matches
    if (recoveredAddress !== lowerAddress) {
      return res.status(401).json({
        message: "Address does not match signature",
        code: "ADDRESS_MISMATCH",
      });
    }

    // Find or create user
    let user = await User.findOne({ address: lowerAddress });
   
    
    const userPkg = await SubscriptionModel.findOne({ address: lowerAddress });
    const pkg = userPkg?.packages?.nft?.pkgId ?? 0;
    if (!user) {
      // Create new user for first-time wallet
      user = await User.create({
        address: lowerAddress,
        role: "user",
        isFirstTime: true,
        isVerified: false,
        isBanned: false,
        lastLoginAt: new Date(),
      });
    } else {
      // Check if user is banned
      if (user.isBanned) {
        return res.status(403).json({
          message: "Account has been banned",
          code: "ACCOUNT_BANNED",
        });
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();
    }
    // Create JWT token
    const { token, expiresIn } = createJWT(lowerAddress, user.role);

    res.cookie("token", token, REFRESH_COOKIE_OPTIONS);
    return res.json({
      success: true,
      token,
      expiresIn,
      user: {
        address: user.address,
        name: user.name || null,
        role: user.role,
        package: pkg,
        isFirstTime: user.isFirstTime,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Error verifying signature:", error);
    res.status(500).json({
      message: "Signature verification failed",
      code: "VERIFICATION_ERROR",
    });
  }
}

/**
 * @POST /auth/refresh
 * Refresh JWT token (extend session)
 *
 * Body: { token: "eyJ..." } or use httpOnly cookie
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    let token = req.body.token || req.cookies.token;

    if (!token) {
      return res.status(401).json({
        message: "No token provided",
        code: "NO_TOKEN",
      });
    }

    // Refresh the token
    const newToken = refreshJWT(token);

    if (!newToken) {
      return res.status(401).json({
        message: "Token refresh failed",
        code: "REFRESH_FAILED",
      });
    }

    // Update cookie if using httpOnly
    res.cookie("token", newToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      token: newToken,
      expiresIn: "7d",
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({
      message: "Token refresh failed",
      code: "REFRESH_ERROR",
    });
  }
};

/**
 * @POST /auth/logout
 * Logout user (invalidate token by blacklisting)
 */
export const logout = async (req: Request, res: Response) => {
  try {
    // Clear httpOnly cookie
    res.clearCookie("token");

    // Optionally blacklist token in Redis
    const token = req.headers.authorization?.slice(7);
    if (token) {
      // Store in blacklist with JWT expiry time
      const expiryTime = 7 * 24 * 60 * 60; // 7 days
      await redis.setex(`blacklist:${token}`, expiryTime, "true");
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).json({
      message: "Logout failed",
      code: "LOGOUT_ERROR",
    });
  }
};

/**
 * @GET /auth/me
 * Get current user info (requires auth middleware)
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
        code: "NO_USER",
      });
    }
    const address = req.user.address;
    const user = await User.findOne({ address }).select("address name role isFirstTime isVerified isBanned lastLoginAt");
   
    
    const userPkg = await SubscriptionModel.findOne({ address });

    const pkg = userPkg?.packages?.nft?.pkgId ?? 0;

    if (!user) {
      return res.status(404).json({
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }
       return res.json({ ...user.toObject(), package: pkg });
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({
      message: "Failed to get user",
      code: "GET_USER_ERROR",
    });
  }
};
