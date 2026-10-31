import { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import { getDb } from "../db";
import { enqueueJob } from "../jobs/queue";
import { streamArchiveZip } from "../archive/export.service";
import { invalidateDashboardCache } from "../dashboard/cache.service";
import { deleteArchivedMails } from "../archive/trash.service";
import fs from "node:fs";
import { escapeIlike, FTS_CONFIG, ftsQuery, notFound } from "../utils/db";
import { extractPagination } from "../utils/pagination";
import { authPresets } from "../utils/auth";
import { createLogger } from "../logger";
import { simpleParser } from "mailparser";
import { HEADLINE_OPTIONS, highlightToHtml } from "../archive/body-text";

/** Sanitize filename for Content-Disposition header (Point 17) */
function sanitizeFilename(name: string): string {
  return name.replaceAll(/["\r\n]/g, '_')
}

const logger = createLogger('archive-routes')

const positiveInt = z.string().regex(/^[1-9]\d*$/).optional();
const mailsQuerySchema = z.object({
  q: z.string().optional(),
  sender: z.string().max(500).optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
  has_attachments: z.enum(["true", "false"]).optional(),
  label: z.string().min(1).max(200).optional(),
  tag: z.string().min(1).max(50).optional(),
  page: positiveInt,
  limit: positiveInt,
});

/** List rows: everything but body_text (heavy, derived), search_vector and eml_path (server path). */
const MAIL_LIST_COLUMNS = [
  "id", "account_id", "gmail_message_id", "thread_id", "in_reply_to", "references_header",
  "subject", "sender", "recipient", "date", "size_bytes", "has_attachments", "label_ids",
  "tags", "snippet", "attachment_names", "is_encrypted", "archived_at", "deleted_at",
] as const;

export async function archiveRoutes(app: FastifyInstance) {
  const { accountAuth, adminAuth } = authPresets(app);
  const db = getDb();

  // ─── Liste / recherche mails archivés ────────────────────
  app.get("/:accountId/mails", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const { q, sender, from_date, to_date, has_attachments, label, tag, ...pagination } =
      mailsQuerySchema.parse(request.query);
    const { page, limit: lim, offset } = extractPagination(pagination);
    const searchTerm = q?.trim().slice(0, 200);
    const started = performance.now();

    let base = db
      .selectFrom("archived_mails")
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null);
    if (sender) base = base.where("sender", "ilike", `%${escapeIlike(sender)}%`);
    if (from_date) base = base.where("date", ">=", from_date);
    if (to_date) base = base.where("date", "<=", to_date);
    if (has_attachments) base = base.where("has_attachments", "=", has_attachments === "true");
    if (label) base = base.where(sql<boolean>`label_ids @> ARRAY[${label}]::text[]`);
    if (tag) base = base.where(sql<boolean>`tags @> ARRAY[${tag}]::text[]`);
    const tsQuery = ftsQuery(searchTerm ?? "");
    if (searchTerm) base = base.where(sql<boolean>`search_vector @@ ${tsQuery}`);

    const [rows, { count }] = await Promise.all([
      base
        .select(MAIL_LIST_COLUMNS)
        .$if(!!searchTerm, (qb) =>
          qb
            .select(sql<string>`ts_headline(${FTS_CONFIG}, COALESCE(body_text, snippet, ''), ${tsQuery}, ${HEADLINE_OPTIONS})`.as("highlight"))
            .orderBy(sql`ts_rank(search_vector, ${tsQuery})`, "desc"),
        )
        .orderBy("date", "desc")
        .limit(lim)
        .offset(offset)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
    ]);

    const mails = searchTerm
      ? rows.map((m) => ({ ...m, highlight: highlightToHtml((m as { highlight?: string }).highlight ?? "") }))
      : rows;
    return { mails, total: Number(count), page, limit: lim, tookMs: Math.round(performance.now() - started) };
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
      .where("account_id", "=", accountId)
      .executeTakeFirst();

    if (!mail) return notFound(reply);

    const attachments = await db
      .selectFrom("archived_attachments")
      .selectAll()
      .where("archived_mail_id", "=", mailId)
      .execute();

    // Parsed here from the raw bytes (8bit mails keep their charset); an encrypted EML has no readable body
    const raw = mail.is_encrypted ? null : await fs.promises.readFile(mail.eml_path).catch(() => null);
    const parsed = raw ? await simpleParser(raw).catch(() => null) : null;
    const { body_text: _bodyText, eml_path: _emlPath, ...rest } = mail;

    return { ...rest, html: parsed?.html || "", text: parsed?.text || "", attachments };
  });

  // ─── Download pièce jointe ───────────────────────────────
  app.get(
    "/:accountId/attachments/:attachmentId/download",
    accountAuth,
    async (request, reply) => {
      const { accountId, attachmentId } = request.params as { accountId: string; attachmentId: string };

      // accountAuth only checks accountId: the attachment must also belong to it
      const att = await db
        .selectFrom("archived_attachments")
        .innerJoin("archived_mails", "archived_mails.id", "archived_attachments.archived_mail_id")
        .selectAll("archived_attachments")
        .where("archived_attachments.id", "=", attachmentId)
        .where("archived_mails.account_id", "=", accountId)
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
      .where("account_id", "=", accountId)
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
        sql`search_vector @@ ${ftsQuery(searchTerm)}`
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
        WHERE account_id = ${accountId}
          AND thread_id IS NOT NULL
          AND deleted_at IS NULL
          ${sender ? sql`AND sender ILIKE ${'%' + escapeIlike(sender) + '%'}` : sql``}
          ${from_date ? sql`AND date >= ${new Date(from_date)}` : sql``}
          ${to_date ? sql`AND date <= ${new Date(to_date)}` : sql``}
          ${has_attachments === "true" ? sql`AND has_attachments = true` : has_attachments === "false" ? sql`AND has_attachments = false` : sql``}
          ${q ? sql`AND search_vector @@ ${ftsQuery(q.trim().slice(0, 200))}` : sql``}
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
        AND am.account_id = ${accountId}
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
      .where("account_id", "=", accountId)
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

    return mails.map(({ body_text: _bodyText, ...m }) => ({
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
      .where("account_id", "=", accountId)
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
      .where("account_id", "=", accountId)
      .where("id", "in", mailIds)
      .where("deleted_at", "is not", null)
      .executeTakeFirst();

    return { restored: Number(result.numUpdatedRows) };
  });

  // ─── Tags (Nid only, never sent to Gmail) ─────────────────
  // No comma: the list filter takes one tag in the query string
  const tagName = z.string().trim().min(1).max(50).regex(/^[^,]+$/);
  const tagsSchema = z.object({
    mailIds: z.array(z.string().uuid()).min(1).max(500),
    add: z.array(tagName).max(20).default([]),
    remove: z.array(tagName).max(20).default([]),
  });

  app.get("/:accountId/tags", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const rows = await db
      .selectFrom(sql<{ tag: string }>`(SELECT unnest(tags) AS tag FROM archived_mails WHERE account_id = ${accountId} AND deleted_at IS NULL)`.as("t"))
      .select(["tag", (eb) => eb.fn.countAll<number>().as("count")])
      .groupBy("tag")
      .orderBy("tag")
      .execute();
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  });

  app.post("/:accountId/mails/tags", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const { mailIds, add, remove } = tagsSchema.parse(request.body);
    const result = await db
      .updateTable("archived_mails")
      .set({ tags: sql`ARRAY(SELECT DISTINCT t FROM unnest(tags || ${add}::text[]) t WHERE t <> ALL(${remove}::text[]) ORDER BY t)` })
      .where("account_id", "=", accountId)
      .where("id", "in", mailIds)
      .executeTakeFirst();
    return { updated: Number(result.numUpdatedRows) };
  });

  // Drops a tag everywhere, trashed mails included (a typo, a tag no longer used)
  app.delete("/:accountId/tags/:tag", accountAuth, async (request) => {
    const { accountId, tag } = request.params as { accountId: string; tag: string };
    const result = await db
      .updateTable("archived_mails")
      .set({ tags: sql`array_remove(tags, ${tag})` })
      .where("account_id", "=", accountId)
      .where(sql<boolean>`tags @> ARRAY[${tag}]::text[]`)
      .executeTakeFirst();
    return { updated: Number(result.numUpdatedRows) };
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
      .select(MAIL_LIST_COLUMNS)
      .where("account_id", "=", accountId)
      .where("deleted_at", "is not", null);

    if (q) {
      const searchTerm = q.trim().slice(0, 200);
      query = (query as any).where(
        sql`search_vector @@ ${ftsQuery(searchTerm)}`
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
      .where("account_id", "=", accountId)
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

    const mails = await db
      .selectFrom("archived_mails")
      .select(["id", "eml_path", "account_id"])
      .where("account_id", "=", accountId)
      .where("deleted_at", "is not", null)
      .execute();

    if (mails.length === 0) return { deleted: 0 };

    await deleteArchivedMails(mails);

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

  // Instance-wide setting: admin only
  app.put("/config/trash", adminAuth, async (request) => {
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
