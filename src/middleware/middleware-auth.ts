import { NextFunction, Request, Response } from "express";
import { UserPayload } from "../types";
import { verifyJWT } from "../utils/web-auth";

/**
 * Middleware: Verify JWT and extract user info
 * Adds user data to req.user
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized - No token provided",
        code: "NO_TOKEN",
      });
    }

    const decoded = verifyJWT(token);

    if (!decoded) {
      return res.status(401).json({
        message: "Unauthorized - Invalid or expired token",
        code: "INVALID_TOKEN",
      });
    }
    req.user = decoded as UserPayload;
    next();
  } catch (error) {
    console.error("Error in authMiddleware:", error);
    return res.status(401).json({
      message: "Unauthorized",
      code: "AUTH_ERROR",
    });
  }
};

/**
 * Middleware: Check if user is admin
 * Must be used AFTER authMiddleware
 */
export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
 
  
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized",
      code: "NO_USER",
    });
  }
  
  const allowedRoles = ["admin", "moderator"];
  if (!allowedRoles.includes(req.user.role.toLowerCase())) {
    return res.status(403).json({
      message: "Forbidden - Admin access required",
      code: "INSUFFICIENT_ROLE",
    });
  }

  next();
};

/**
 * Middleware: Check if user matches the requested address
 * Prevents users from accessing other users' data
 */
export const ownershipMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized", code: "NO_USER" });

  const requestedAddress = ((req.query.address || req.body.address || "") as string).toLowerCase();

  if (!requestedAddress) return res.status(400).json({ message: "Address not provided", code: "MISSING_ADDRESS" });

  if (req.user.address !== requestedAddress && !["admin", "moderator"].includes(req.user.role.toLowerCase())) {
    return res.status(403).json({ message: "Forbidden - You can only access your own data", code: "OWNERSHIP_VIOLATION" });
  }
  next();
};

/**
 * Middleware: Optional auth (doesn't fail if no token)
 * Useful for routes that work both authenticated and unauthenticated
 */
export const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.token;

    if (token) {
      const decoded = verifyJWT(token);
        
      if (decoded) req.user = decoded;
    }

    next();
  } catch (error) {
    console.error("Error in optionalAuthMiddleware:", error);
    next();
  }
};
