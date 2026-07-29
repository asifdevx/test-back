import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import mongoSanitize from "express-mongo-sanitize";
import { createHandler } from "graphql-http/lib/use/express";
import helmet from "helmet";

import { corsOptions } from "./config/cors";
import env from "./constant/env";
import { UserFullInfo } from "./graphql/controler/userProfile.controller";
import { optionalAuthMiddleware } from "./middleware/middleware-auth";

import authRouter from "./router/rou.auth";
import { connectDB } from "./config/connectdb";
import adminRouter from "./router/rou.admin";
import swap from "./router/rou.swap";

const app = express();


app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }) as RequestHandler,
);

app.use(cookieParser());


app.use(mongoSanitize());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
/**
 * CORS - Restrict origin
 */

export const restrictedCors = cors(corsOptions);
const publicCors = cors({ origin: "*" });

/**
 * Global rate limiter
 * Applied to all requests (role-based)
 */
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});
app.use(optionalAuthMiddleware);
// app.use(apiLimiter);

// ============================================
// 📍 HEALTH CHECK (No auth required)
// ============================================

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: env.node_env,
    version: env.API_VERSION,
  });
});

app.get("/status", (req: Request, res: Response) => {
  res.json({ status: "operational" });
});

// ============================================
// 🔐 AUTHENTICATION ROUTES (Public, rate-limited)
// ============================================

/**
 * Auth routes:
 * - POST /auth/request-message
 * - POST /auth/verify-signature
 * - POST /auth/refresh
 * - GET /auth/me
 * - POST /auth/logout
 */
app.use("/auth", restrictedCors, authRouter);




app.all(
  "/g",
  restrictedCors,
  createHandler({
    schema: UserFullInfo,
  }),
);
  app.get("/", (_, res) => res.send("Welcome to the Kunstify API!"));
  
//  app.use("/user",publicCors, user);

  //admin
 app.use("/admin",restrictedCors, adminRouter);




/**
 * 404 Not Found handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    code: "NOT_FOUND",
    message: "Route not found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Global error handler
 * Must be last middleware
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", {
    message: err.message,
    code: err.code,
    stack: env.node_env === "test" ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  });

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // Handle specific errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  } else if (err.code === "RATE_LIMIT_EXCEEDED") {
    statusCode = 429;
  }

  // Don't expose error details in production
  const response: any = {
    code: err.code || "ERROR",
    message,
    timestamp: new Date().toISOString(),
  };

  if (env.node_env === "test") {
    response.stack = err.stack;
    response.details = err;
  }

  res.status(statusCode).json(response);
});

export default app;
