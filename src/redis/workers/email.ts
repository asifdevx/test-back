import { Worker } from "bullmq";
import { redisConnection } from "../../config/redis";
import { mailer } from "../../services/mailer";

new Worker(
  "email-campaign",
  async (job) => {
    const { to, subject, html } = job.data;

    await mailer({ to, subject, html });
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);





