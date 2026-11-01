import "./types"; // Augment Fastify types
import Fastify from "fastify";
import { config } from "./config";
import { registerPlugins } from "./plugins";
import { registerRoutes } from "./routes";
import { startUnifiedWorker } from "./jobs/workers/unified.worker";
import { startReportScheduler } from "./reports/report.scheduler";
import { startUpdateChecker } from "./about/about.service";
import { startRuleScheduler } from "./jobs/scheduler";
import type { Worker } from "bullmq";

const server = Fastify({
  // request.ip from X-Forwarded-For set by these proxies only: else every client is nginx's 127.0.0.1 and
  // each rate limit (login, password reset…) is shared by the whole instance
  trustProxy: config.TRUST_PROXY,
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

// Track active workers for graceful shutdown (Point 18)
const workers: Worker[] = [];

async function bootstrap() {
  try {
    await registerPlugins(server);
    await registerRoutes(server);

    // Start single unified BullMQ worker
    workers.push(startUnifiedWorker());
    startRuleScheduler();
    startReportScheduler();
    startUpdateChecker();
    server.log.info("✅ BullMQ workers started");

    await server.listen({ port: config.PORT, host: "0.0.0.0" });
    server.log.info(`🚀 Nid API running on port ${config.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown (Point 18)
const signals = ["SIGTERM", "SIGINT"] as const;
signals.forEach((signal) => {
  process.on(signal, async () => {
    server.log.info(`${signal} received, shutting down...`);
    // Close workers first so no new jobs are picked up
    await Promise.allSettled(workers.map((w) => w.close()));
    server.log.info("BullMQ workers stopped");
    await server.close();
    process.exit(0);
  });
});

await bootstrap();
