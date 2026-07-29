import { CorsOptions } from "cors";
import { BASE_URL } from "./base";

const whitelist = ["https://kun-frontend.vercel.app"];
if (process.env.NODE_ENV === "test") {
  whitelist.push("http://localhost:3000");
}
export const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (whitelist.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};


