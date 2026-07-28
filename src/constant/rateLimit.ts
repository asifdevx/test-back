export const RATE_LIMITS: Record<string, { max: number; windowMs: number; message: string }> = {
  guest: { max: 300, windowMs: 15 * 60 * 1000, message: "Too many requests. Please try again later." },
  user: { max: 600, windowMs: 15 * 60 * 1000, message: "Rate limit reached. Slow down." },
  creator: { max: 300, windowMs: 15 * 60 * 1000, message: "Rate limit reached." },
  admin: { max: 300, windowMs: 15 * 60 * 1000, message: "Admin rate limit reached." },
  moderator: { max: 300, windowMs: 15 * 60 * 1000, message: "Moderator rate limit reached." },
};
