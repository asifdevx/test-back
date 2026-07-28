import IORedis from "ioredis";

const redis = new IORedis({
    host: process.env.REDIS_HOST||"127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  username: "default",
  password: "gQAAAAAAAmNKAAIgcDJhZGNiNTZiODQzMzU0ODFmOTM4MjdiYzgzZDljM2MyNA",
  tls: {}, // Required for Upstash
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("[✅ Redis] connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

export const redisConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export { redis };
