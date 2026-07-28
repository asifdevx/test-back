
import { Worker } from "bullmq";
import { redisConnection } from "../../config/redis";
import { processor } from "../../Processor";

new Worker(
  "blockchain-events",
  async (job) => {
    const { key, payload } = job.data; // Now 'key' will be "ERC721Transfer", etc.

    if (processor[key]) {
      console.info(`[BULLMQ] Processing ${key} for block ${payload.event.blockNumber}...`);
      await processor[key](payload);
    } else {
      // This will now show the actual key that's missing
      console.warn(`[BULLMQ] No handler registered for key: ${key}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
  },
);
