import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { QueueEvents } from "bullmq";
import { getRedis } from "../plugins/redis";
import { getDb } from "../db";
import pino from 'pino'
import type { ServerResponse } from 'http'

const logger = pino({ name: 'job-sse' })

// Map des connexions SSE actives : jobId → Set<reply>
const subscribers = new Map<string, Set<ServerResponse>>();

export async function jobSseRoutes(app: FastifyInstance) {
  // SSE: read JWT from httpOnly cookie (primary) or Authorization header (fallback)
  const verifyToken = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };

  // ─── SSE stream pour un job précis ────────────────────────
  // GET /api/jobs/:jobId/events → text/event-stream
  app.get(
    "/:jobId/events",
    {
      preHandler: [verifyToken],
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const db = getDb();
      const userId = request.user.sub;

      // Vérifier que le job existe et appartient au user
      const job = await db
        .selectFrom("jobs")
        .select(["id", "bullmq_id", "status"])
        .where("bullmq_id", "=", jobId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!job) return reply.code(404).send({ error: "Job not found" });

      // Si déjà terminé, envoyer l'état final directement et fermer
      if (["completed", "failed", "cancelled"].includes(job.status)) {
        const final = await db
          .selectFrom("jobs")
          .selectAll()
          .where("bullmq_id", "=", jobId)
          .executeTakeFirst();
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no", // Nginx : désactiver le buffering
        });
        reply.raw.write(`data: ${JSON.stringify(final)}\n\n`);
        reply.raw.write("event: close\ndata: {}\n\n");
        reply.raw.end();
        return reply;
      }

      // Ouvrir le stream SSE
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Enregistrer le subscriber
      if (!subscribers.has(jobId)) subscribers.set(jobId, new Set());
      const subs = subscribers.get(jobId)!;
      subs.add(reply.raw);

      // Heartbeat toutes les 15s pour garder la connexion ouverte
      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) reply.raw.write(": heartbeat\n\n");
      }, 15_000);

      // Cleanup à la déconnexion du client
      reply.raw.on("close", () => {
        clearInterval(heartbeat);
        subs.delete(reply.raw);
        if (subs.size === 0) subscribers.delete(jobId);
      });

      // Envoyer l'état courant immédiatement
      const current = await db
        .selectFrom("jobs")
        .selectAll()
        .where("bullmq_id", "=", jobId)
        .executeTakeFirst();
      reply.raw.write(`data: ${JSON.stringify(current)}\n\n`);

      return reply;
    },
  );
}

// ─── Broadcaster — appelé depuis les workers ───────────────
// Publie les mises à jour vers tous les clients SSE abonnés à un job
export function broadcastJobUpdate(bullmqId: string, update: object) {
  for (const [jobId, subs] of subscribers.entries()) {
    if (jobId === bullmqId) {
      subs.forEach((raw) => {
        if (!raw.destroyed) {
          raw.write(`data: ${JSON.stringify({ bullmqId, ...update })}\n\n`);
        }
      });
    }
  }
}

async function fetchJobState(bullmqId: string) {
  const db = getDb();
  return db
    .selectFrom("jobs")
    .selectAll()
    .where("bullmq_id", "=", bullmqId)
    .executeTakeFirst();
}

// ─── Intégration QueueEvents BullMQ ───────────────────────
// Écoute les events de la queue et broadcast aux clients SSE
export function startQueueEventBroadcaster() {
  const queueEvents = new QueueEvents("nid", {
    connection: getRedis(),
  });

  queueEvents.on("progress", async ({ jobId }) => {
    const row = await fetchJobState(jobId);
    if (row) {
      broadcastJobUpdate(jobId, {
        type: "progress",
        status: row.status,
        progress: row.progress,
        processed: row.processed,
        total: row.total,
      });
    }
  });

  queueEvents.on("completed", async ({ jobId }) => {
    const row = await fetchJobState(jobId);
    broadcastJobUpdate(jobId, {
      type: "completed",
      status: "completed",
      progress: 100,
      processed: row?.processed ?? row?.total ?? 0,
      total: row?.total ?? 0,
    });
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    broadcastJobUpdate(jobId, {
      type: "failed",
      status: "failed",
      error: failedReason,
    });
  });

  logger.info('SSE QueueEvents broadcaster started');
  return queueEvents;
}
