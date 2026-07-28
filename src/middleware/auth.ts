// middleware/auth.ts
import { NextFunction, Request, Response } from "express";
import { PayConfig } from "../mongoDb/schemas/sch.payConfig";
import { hashValue } from "../utils/genaretKey";

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing API key" });
    }

    const apiKey = auth.split(" ")[1];
    const hashed = hashValue(apiKey);

   const merchant = await PayConfig.findOne({
     keys: {
       $elemMatch: {
         apiKeyHash: hashed,
         isActive: true,
       },
     },
   });

    if (!merchant) {
      return res.status(401).json({ message: "Invalid API key" });
    }

    req.merchantId = merchant._id;
    next();
  } catch (err) {
    return res.status(500).json({ message: "Auth error" });
  }
};
