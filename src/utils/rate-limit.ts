import { NextFunction, Request, Response } from "express";
import { redis } from "../config/redis";
import { RATE_LIMITS } from "../constant/rateLimit";

const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;

export const apiLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.user?.role || "guest";
    const config = RATE_LIMITS[role];
    if (!config) return next();

    const identifier = req.user?.address ? `addr:${req.user.address.toLowerCase()}` : `ip:${req.ip || "unknown"}`;
    const key = `rl:global:${role}:${identifier}`;

    const [current, ttl] = (await redis.eval(RATE_LIMIT_SCRIPT, 1, key, config.windowMs)) as [number, number];

    const remaining = Math.max(0, config.max - current);
    const resetTime = Date.now() + (ttl > 0 ? ttl : config.windowMs);
   
    
    res.setHeader("X-RateLimit-Limit", config.max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000));
    res.setHeader("X-RateLimit-Role", role);

    if (current > config.max) {
      return res.status(429).json({
        code: "RATE_LIMIT_EXCEEDED",
        message: config.message,
        retryAfter: Math.ceil(ttl / 1000),
        role,
        limit: config.max,
        current,
        resetTime: new Date(resetTime),
      });
    }
    next();
  } catch (error) {
    console.error("Rate limit processing failure:", error);
    next(); // fail-open kept
  }
};

async function scanKeys(pattern: string): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

export const resetUserRateLimit = async (address: string) => {
  const keys = await scanKeys(`rl:global:*:addr:${address.toLowerCase()}`);
  if (keys.length > 0) await redis.del(...keys);
  return { success: true, message: `Rate limit cleared for ${address}` };
};