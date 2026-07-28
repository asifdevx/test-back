// src/index.ts
import "dotenv/config";
import { createServer } from "http";
import app from "./app";
import { connectDB } from "./config/connectdb";


import "./redis/index";

const PORT = process.env.PORT || 8000;
const httpServer = createServer(app);

const start = async () => {
  try {
    await connectDB();
    httpServer.listen({ port: Number(PORT), host: "127.0.0.1" }, () => {
      console.log("[✅ Server] Started ");
    });

    // await startListeners();
  } catch (error) {
    console.error("MAIN server", error);
    process.exit(1);
  }
};

start();
