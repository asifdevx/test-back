import "dotenv/config";
export const API_CALL = process.env.BACKEND_URL || "http://localhost:8000";
export const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export const DEX_BASE = "https://api.dexscreener.com";