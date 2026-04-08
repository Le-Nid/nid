import { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import { getDb } from "../db";
import { enqueueJob } from "../jobs/queue";
import { streamArchiveZip } from "../archive/export.service";
import { invalidateDashboardCache } from "../dashboard/cache.service";
import { getStorageForUser } from "../storage/storage.service";
import fs from "node:fs";
import { escapeIlike, notFound } from "../utils/db";
import { extractPagination } from "../utils/pagination";
import { authPresets } from "../utils/auth";
import { createLogger } from "../logger";

/** Sanitize filename for Content-Disposition header (Point 17) */
function sanitizeFilename(name: string): string {
  return name.replaceAll(/["\r\n]/g, '_')
}

const logger = createLogger('archive-routes')

export async function archiveRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app);
  const db = getDb();

  // ─── Liste mails archivés ─────────────────────────────────
  app.get("/:accountId/mails", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const {
      q,
      sender,
      from_date,
      to_date,
      has_attachments,
      page: pageStr,
      limit: limitStr,
    } = request.query as Record<string, string>;

    const { page, limit: lim, offset } = extractPagination({ page: pageStr, limit: limitStr });

    let query = db
      .selectFrom("archived_mails")
      .selectAll()
      .where("gmail_account_id", "=", accountId)
      .where("deleted_at", "is", null);

    if (sender) {
      query = query.where("sender", "ilike", `%${escapeIlike(sender)}%`);
    }
    if (from_date) {
      query = query.where("date", ">=", new Date(from_date));
    }
    if (to_date) {
      query = query.where("date", "<=", new Date(to_date));
    }
    if (has_attachments === "true" || has_attachments === "false") {
      query = query.where("has_attachments", "=", has_attachments === "true");
    }

    let mails;
    if (q) {
      // Full-text search via plainto_tsquery (Point 11: safe against operator injection)
      const searchTerm = q.trim().slice(0, 200);
      let fsQuery = db
        .selectFrom("archived_mails")
        .selectAll()
        .where("gmail_account_id", "=", accountId)
        .where("deleted_at", "is", null);

      if (sender) {
        fsQuery = fsQuery.where("sender", "ilike", `%${escapeIlike(sender)}%`);
      }
      if (from_date) {
        fsQuery = fsQuery.where("date", ">=", new Date(from_date));
      }
      if (to_date) {
        fsQuery = fsQuery.where("date", "<=", new Date(to_date));
      }
      if (has_attachments === "true" || has_attachments === "false") {
        fsQuery = fsQuery.where("has_attachments", "=", has_attachments === "true");
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
      .where("deleted_at", "is", null)
      .executeTakeFirstOrThrow();

    return { mails, total: Number(count), page, limit: lim };
  });

  // ─── Mail archivé + pièces jointes ───────────────────────
  app.get("/:accountId/mails/:mailId", accountAuth, async (request, reply) => {
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

    if (!mail) return notFound(reply);

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
    accountAuth,
    async (request, reply) => {
      const { attachmentId } = request.params as { attachmentId: string };

      const att = await db
        .selectFrom("archived_attachments")
        .selectAll()
        .where("id", "=", attachmentId)
        .executeTakeFirst();

      if (!att) return notFound(reply);

      return reply
        .header("Content-Disposition", `attachment; filename="${sanitizeFilename(att.filename)}"`)
        .header("Content-Type", att.mime_type ?? "application/octet-stream")
        .send(fs.createReadStream(att.file_path));
    },
  );

  // ─── Déclencher un archivage ─────────────────────────────
  app.post("/:accountId/archive", accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const userId = request.user.sub;
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
  app.post("/:accountId/export-zip", accountAuth, async (request, reply) => {
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

  // ─── Liste mails archivés groupés par thread ─────────────
  app.get("/:accountId/threads", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const {
      q,
      sender,
      from_date,
      to_date,
      has_attachments,
      page: pageStr,
      limit: limitStr,
    } = request.query as Record<string, string>;

    const { page, limit: lim, offset } = extractPagination({ page: pageStr, limit: limitStr });

    // Get threads: group by thread_id, return latest mail per thread
    let baseQuery = db
      .selectFrom("archived_mails")
      .where("gmail_account_id", "=", accountId)
      .where("thread_id", "is not", null)
      .where("deleted_at", "is", null);

    if (sender) {
      baseQuery = baseQuery.where("sender", "ilike", `%${escapeIlike(sender)}%`);
    }
    if (from_date) {
      baseQuery = baseQuery.where("date", ">=", new Date(from_date));
    }
    if (to_date) {
      baseQuery = baseQuery.where("date", "<=", new Date(to_date));
    }
    if (has_attachments === "true" || has_attachments === "false") {
      baseQuery = baseQuery.where("has_attachments", "=", has_attachments === "true");
    }

    if (q) {
      const searchTerm = q.trim().slice(0, 200);
      baseQuery = (baseQuery as any).where(
        sql`search_vector @@ plainto_tsquery('french', ${searchTerm})`
      );
    }

    // Count distinct threads
    const countResult = await (baseQuery as any)
      .select((eb: any) => eb.fn.count(sql`DISTINCT thread_id`).as("count"))
      .executeTakeFirstOrThrow();

    // Get thread summaries: latest mail per thread + message count
    const threads = await sql`
      WITH thread_data AS (
        SELECT
          thread_id,
          COUNT(*)::int AS message_count,
          MAX(date) AS latest_date,
          ARRAY_AGG(DISTINCT sender) AS senders,
          SUM(size_bytes)::bigint AS total_size,
          BOOL_OR(has_attachments) AS has_attachments
        FROM archived_mails
        WHERE gmail_account_id = ${accountId}
          AND thread_id IS NOT NULL
          AND deleted_at IS NULL
          ${sender ? sql`AND sender ILIKE ${'%' + escapeIlike(sender) + '%'}` : sql``}
          ${from_date ? sql`AND date >= ${new Date(from_date)}` : sql``}
          ${to_date ? sql`AND date <= ${new Date(to_date)}` : sql``}
          ${has_attachments === "true" ? sql`AND has_attachments = true` : has_attachments === "false" ? sql`AND has_attachments = false` : sql``}
          ${q ? sql`AND search_vector @@ plainto_tsquery('french', ${q.trim().slice(0, 200)})` : sql``}
        GROUP BY thread_id
        ORDER BY latest_date DESC
        LIMIT ${lim} OFFSET ${offset}
      )
      SELECT
        td.thread_id,
        td.message_count,
        td.latest_date,
        td.senders,
        td.total_size,
        td.has_attachments,
        am.id,
        am.subject,
        am.sender,
        am.snippet,
        am.date,
        am.archived_at
      FROM thread_data td
      JOIN archived_mails am ON am.thread_id = td.thread_id
        AND am.gmail_account_id = ${accountId}
        AND am.date = td.latest_date
      ORDER BY td.latest_date DESC
    `.execute(db);

    return {
      threads: threads.rows,
      total: Number(countResult.count),
      page,
      limit: lim,
    };
  });

  // ─── Get all mails in a thread ────────────────────────────
  app.get("/:accountId/threads/:threadId", accountAuth, async (request) => {
    const { accountId, threadId } = request.params as {
      accountId: string;
      threadId: string;
    };

    const mails = await db
      .selectFrom("archived_mails")
      .selectAll()
      .where("gmail_account_id", "=", accountId)
      .where("thread_id", "=", threadId)
      .where("deleted_at", "is", null)
      .orderBy("date", "asc")
      .execute();

    // Fetch attachments for all mails in thread
    const mailIds = mails.map((m) => m.id);
    const attachments = mailIds.length
      ? await db
          .selectFrom("archived_attachments")
          .selectAll()
          .where("archived_mail_id", "in", mailIds)
          .execute()
      : [];

    // Group attachments by mail
    const attMap = new Map<string, typeof attachments>();
    for (const att of attachments) {
      const list = attMap.get(att.archived_mail_id) ?? [];
      list.push(att);
      attMap.set(att.archived_mail_id, list);
    }

    return mails.map((m) => ({
      ...m,
      attachments: attMap.get(m.id) ?? [],
    }));
  });

  // ─── Soft-delete (move to trash) ──────────────────────────
  const trashSchema = z.object({
    mailIds: z.array(z.string().uuid()).min(1).max(500),
  });

  app.post("/:accountId/mails/trash", accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const { mailIds } = trashSchema.parse(request.body);

    const result = await db
      .updateTable("archived_mails")
      .set({ deleted_at: new Date() })
      .where("gmail_account_id", "=", accountId)
      .where("id", "in", mailIds)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return { trashed: Number(result.numUpdatedRows) };
  });

  // ─── Restore from trash ───────────────────────────────────
  app.post("/:accountId/mails/restore", accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const { mailIds } = trashSchema.parse(request.body);

    const result = await db
      .updateTable("archived_mails")
      .set({ deleted_at: null })
      .where("gmail_account_id", "=", accountId)
      .where("id", "in", mailIds)
      .where("deleted_at", "is not", null)
      .executeTakeFirst();

    return { restored: Number(result.numUpdatedRows) };
  });

  // ─── List trash ───────────────────────────────────────────
  app.get("/:accountId/trash", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const {
      q,
      page: pageStr,
      limit: limitStr,
    } = request.query as Record<string, string>;

    const { page, limit: lim, offset } = extractPagination({ page: pageStr, limit: limitStr });

    let query = db
      .selectFrom("archived_mails")
      .selectAll()
      .where("gmail_account_id", "=", accountId)
      .where("deleted_at", "is not", null);

    if (q) {
      const searchTerm = q.trim().slice(0, 200);
      query = (query as any).where(
        sql`search_vector @@ plainto_tsquery('french', ${searchTerm})`
      );
    }

    const mails = await query
      .orderBy("deleted_at", "desc")
      .limit(lim)
      .offset(offset)
      .execute();

    const { count } = await db
      .selectFrom("archived_mails")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("gmail_account_id", "=", accountId)
      .where("deleted_at", "is not", null)
      .executeTakeFirstOrThrow();

    // Get trash retention config for display
    const retentionConfig = await db
      .selectFrom("system_config")
      .select("value")
      .where("key", "=", "archive_trash_retention_days")
      .executeTakeFirst();
    const retentionDays = retentionConfig ? Number(JSON.parse(String(retentionConfig.value))) : 30;

    return { mails, total: Number(count), page, limit: lim, retentionDays };
  });

  // ─── Empty trash (permanent delete) ───────────────────────
  app.delete("/:accountId/trash", accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const userId = request.user.sub;

    const mails = await db
      .selectFrom("archived_mails")
      .select(["id", "eml_path", "gmail_account_id"])
      .where("gmail_account_id", "=", accountId)
      .where("deleted_at", "is not", null)
      .execute();

    if (mails.length === 0) return { deleted: 0 };

    const storage = await getStorageForUser(userId);
    const mailIds = mails.map((m) => m.id);

    // Delete attachments files + DB
    const attachments = await db
      .selectFrom("archived_attachments")
      .select(["id", "file_path"])
      .where("archived_mail_id", "in", mailIds)
      .execute();

    for (const att of attachments) {
      try { await storage.deleteFile(att.file_path); } catch { /* ignore */ }
    }

    if (attachments.length) {
      await db
        .deleteFrom("archived_attachments")
        .where("archived_mail_id", "in", mailIds)
        .execute();
    }

    // Delete EML files
    for (const mail of mails) {
      try { await storage.deleteFile(mail.eml_path); } catch { /* ignore */ }
    }

    // Delete DB records
    await db
      .deleteFrom("archived_mails")
      .where("id", "in", mailIds)
      .execute();

    logger.info(`Emptied trash for account ${accountId}: ${mails.length} mail(s) permanently deleted`);
    return { deleted: mails.length };
  });

  // ─── System config: get trash settings ────────────────────
  app.get("/config/trash", { preHandler: [app.authenticate] }, async () => {
    const rows = await db
      .selectFrom("system_config")
      .selectAll()
      .where("key", "in", ["archive_trash_retention_days", "archive_trash_purge_enabled"])
      .execute();

    const config: Record<string, unknown> = {};
    for (const row of rows) {
      config[row.key] = JSON.parse(String(row.value));
    }
    return {
      retentionDays: (config.archive_trash_retention_days as number) ?? 30,
      purgeEnabled: (config.archive_trash_purge_enabled as boolean) ?? true,
    };
  });

  // ─── System config: update trash settings ─────────────────
  const trashConfigSchema = z.object({
    retentionDays: z.number().int().min(1).max(365).optional(),
    purgeEnabled: z.boolean().optional(),
  });

  app.put("/config/trash", { preHandler: [app.authenticate] }, async (request) => {
    const { retentionDays, purgeEnabled } = trashConfigSchema.parse(request.body);

    if (retentionDays !== undefined) {
      await db
        .insertInto("system_config")
        .values({
          key: "archive_trash_retention_days",
          value: JSON.stringify(retentionDays),
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column("key").doUpdateSet({
            value: JSON.stringify(retentionDays),
            updated_at: new Date(),
          })
        )
        .execute();
    }

    if (purgeEnabled !== undefined) {
      await db
        .insertInto("system_config")
        .values({
          key: "archive_trash_purge_enabled",
          value: JSON.stringify(purgeEnabled),
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column("key").doUpdateSet({
            value: JSON.stringify(purgeEnabled),
            updated_at: new Date(),
          })
        )
        .execute();
    }

    return { ok: true };
  });
}
