import { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { getDb } from "../db";
import { enqueueJob } from "../jobs/queue";
import { streamArchiveZip } from "../archive/export.service";
import { invalidateDashboardCache } from "../dashboard/cache.service";
import fs from "node:fs";

/** Escape ILIKE special characters to prevent wildcard injection (Point 10) */
function escapeIlike(str: string): string {
  return str.replaceAll(/[%_\\]/g, String.raw`\$&`)
}

/** Sanitize filename for Content-Disposition header (Point 17) */
function sanitizeFilename(name: string): string {
  return name.replaceAll(/["\r\n]/g, '_')
}

export async function archiveRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate, app.requireAccountOwnership] };
  const db = getDb();

  // ─── Liste mails archivés ─────────────────────────────────
  app.get("/:accountId/mails", auth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const {
      q,
      sender,
      from_date,
      to_date,
      page = "1",
      limit = "50",
    } = request.query as Record<string, string>;

    const offset = (Number.parseInt(page) - 1) * Math.min(Number.parseInt(limit), 100);
    const lim = Math.min(Number.parseInt(limit), 100);

    let query = db
      .selectFrom("archived_mails")
      .selectAll()
      .where("gmail_account_id", "=", accountId);

    if (sender) {
      query = query.where("sender", "ilike", `%${escapeIlike(sender)}%`);
    }
    if (from_date) {
      query = query.where("date", ">=", new Date(from_date));
    }
    if (to_date) {
      query = query.where("date", "<=", new Date(to_date));
    }

    let mails;
    if (q) {
      // Full-text search via plainto_tsquery (Point 11: safe against operator injection)
      const searchTerm = q.trim().slice(0, 200);
      let fsQuery = db
        .selectFrom("archived_mails")
        .selectAll()
        .where("gmail_account_id", "=", accountId);

      if (sender) {
        fsQuery = fsQuery.where("sender", "ilike", `%${escapeIlike(sender)}%`);
      }
      if (from_date) {
        fsQuery = fsQuery.where("date", ">=", new Date(from_date));
      }
      if (to_date) {
        fsQuery = fsQuery.where("date", "<=", new Date(to_date));
      }

      mails = await (fsQuery as any)
        .where(sql`search_vector @@ plainto_tsquery('french', ${searchTerm})`)
        .orderBy(
          sql`ts_rank(search_vector, plainto_tsquery('french', ${searchTerm}))`,
          "desc",
        )
        .orderBy("date", "desc")
        .limit(lim)
        .offset(offset)
        .execute();
    } else {
      mails = await query
        .orderBy("date", "desc")
        .limit(lim)
        .offset(offset)
        .execute();
    }

    const { count } = await db
      .selectFrom("archived_mails")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("gmail_account_id", "=", accountId)
      .executeTakeFirstOrThrow();

    return { mails, total: Number(count), page: Number.parseInt(page), limit: lim };
  });

  // ─── Mail archivé + pièces jointes ───────────────────────
  app.get("/:accountId/mails/:mailId", auth, async (request, reply) => {
    const { accountId, mailId } = request.params as {
      accountId: string;
      mailId: string;
    };

    const mail = await db
      .selectFrom("archived_mails")
      .selectAll()
      .where("id", "=", mailId)
      .where("gmail_account_id", "=", accountId)
      .executeTakeFirst();

    if (!mail) return reply.code(404).send({ error: "Not found" });

    const attachments = await db
      .selectFrom("archived_attachments")
      .selectAll()
      .where("archived_mail_id", "=", mailId)
      .execute();

    const emlContent = fs.existsSync(mail.eml_path)
      ? fs.readFileSync(mail.eml_path, "utf-8")
      : null;

    return { ...mail, emlContent, attachments };
  });

  // ─── Download pièce jointe ───────────────────────────────
  app.get(
    "/:accountId/attachments/:attachmentId/download",
    auth,
    async (request, reply) => {
      const { attachmentId } = request.params as { attachmentId: string };

      const att = await db
        .selectFrom("archived_attachments")
        .selectAll()
        .where("id", "=", attachmentId)
        .executeTakeFirst();

      if (!att) return reply.code(404).send({ error: "Not found" });

      return reply
        .header("Content-Disposition", `attachment; filename="${sanitizeFilename(att.filename)}"`)
        .header("Content-Type", att.mime_type ?? "application/octet-stream")
        .send(fs.createReadStream(att.file_path));
    },
  );

  // ─── Déclencher un archivage ─────────────────────────────
  app.post("/:accountId/archive", auth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const { sub: userId } = request.user as { sub: string };
    const {
      messageIds,
      query,
      differential = true,
    } = request.body as {
      messageIds?: string[];
      query?: string;
      differential?: boolean;
    };

    const job = await enqueueJob("archive_mails", {
      accountId,
      userId,
      messageIds,
      query,
      differential,
    });
    await invalidateDashboardCache(accountId);
    return reply.code(202).send({ jobId: job.id });
  });

  // ─── Export ZIP ───────────────────────────────────────────
  app.post("/:accountId/export-zip", auth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const { mailIds } = request.body as { mailIds: string[] };

    if (!mailIds?.length)
      return reply.code(400).send({ error: "mailIds requis" });

    const filename = `archive-export-${new Date().toISOString().slice(0, 10)}.zip`;
    reply.raw.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Transfer-Encoding": "chunked",
    });

    try {
      await streamArchiveZip(accountId, mailIds, reply.raw);
    } catch (err) {
      app.log.error(err, "Export ZIP error");
    }

    return reply;
  });
}
