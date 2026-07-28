import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const emailQueue = new Queue("email-campaign", { connection: redisConnection });

export const blockchainEventQueue = new Queue("blockchain-events", { connection: redisConnection });

export const nftImportQueue = new Queue("nft-import-queue", { connection: redisConnection });
