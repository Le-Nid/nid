import "./types"; // Augment Fastify types
import Fastify from "fastify";
import { config } from "./config";
import { registerPlugins } from "./plugins";
import { registerRoutes } from "./routes";
import { startBulkWorker } from "./jobs/workers/bulk.worker";
import { startArchiveWorker } from "./jobs/workers/archive.worker";
import { startRuleWorker } from "./jobs/workers/rule.worker";
import { startRuleScheduler } from "./jobs/scheduler";

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

async function bootstrap() {
  try {
    await registerPlugins(server);
    await registerRoutes(server);

    // Start BullMQ workers
    startBulkWorker();
    startArchiveWorker();
    startRuleWorker();
    startRuleScheduler();
    server.log.info("✅ BullMQ workers started");

    await server.listen({ port: config.PORT, host: "0.0.0.0" });
    server.log.info(`🚀 Gmail Manager API running on port ${config.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ["SIGTERM", "SIGINT"] as const;
signals.forEach((signal) => {
  process.on(signal, async () => {
    server.log.info(`${signal} received, shutting down...`);
    await server.close();
    process.exit(0);
  });
});

bootstrap();
