import { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import {
  getRules,
  getRule,
  getRuleByTemplate,
  createRule,
  updateRule,
  deleteRule,
  buildGmailQuery,
} from "../rules/rules.service";
import { enqueueJob } from "../jobs/queue";
import { listMessages, batchGetMessages } from "../gmail/gmail.service";
import { findOrCreateLabel } from "../labels/labels.service";
import { RULE_TEMPLATES } from "../rules/rule-templates";
import { logAudit } from "../audit/audit.service";
import { notFound } from "../utils/db";
import { authPresets } from "../utils/auth";
import { publishUserEvents } from "../events/events.service";
import { getDb } from "../db";

const conditionSchema = z.object({
  field: z.enum([
    "from",
    "to",
    "subject",
    "has_attachment",
    "size_gt",
    "size_lt",
    "label",
    "older_than",
    "newer_than",
  ]),
  operator: z.enum([
    "contains",
    "not_contains",
    "equals",
    "not_equals",
    "gt",
    "lt",
    "is_true",
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const actionSchema = z.object({
  type: z.enum([
    "trash",
    "delete",
    "label",
    "unlabel",
    "archive",
    "archive_nas",
    "mark_read",
    "mark_unread",
  ]),
  labelId: z.string().optional(),
});

const conditionsSchema = z
  .array(conditionSchema)
  .min(1)
  .refine((conds) => { try { buildGmailQuery(conds); return true } catch { return false } },
    { message: "Unsupported condition (field/operator combination)" });

const ruleCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  conditions: conditionsSchema,
  action: actionSchema,
  schedule: z
    .enum(["hourly", "daily", "weekly", "monthly"])
    .nullable()
    .optional(),
  is_active: z.boolean().optional(),
});

export async function rulesRoutes(app: FastifyInstance) {
  const { auth, accountAuth } = authPresets(app);

  // B3: create/update/toggle/delete change the sidebar's active-rules counter (preview/run publish harmlessly)
  app.addHook("onResponse", async (request, reply) => {
    if (request.method !== "GET" && reply.statusCode < 300 && request.user?.sub)
      publishUserEvents(request.user.sub).catch((err) => request.log.warn({ err }, "rules: publish counters failed"));
  });

  // ─── Templates ────────────────────────────────────────
  app.get("/templates", auth, async () => {
    return RULE_TEMPLATES;
  });

  app.post("/:accountId/from-template", accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const userId = request.user.sub;
    const { templateId } = z.object({ templateId: z.string().min(1) }).parse(request.body);
    const template = RULE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return notFound(reply, "Template not found");
    // shortcut: check-then-insert; a concurrent double submit hits the unique index (500) instead of returning the rule
    const existing = await getRuleByTemplate(accountId, templateId);
    if (existing) return existing;
    const dto = template.label
      ? { ...template.dto, action: { type: "label" as const, labelId: await findOrCreateLabel(accountId, template.label.name) } }
      : template.dto;
    const rule = await createRule(accountId, dto, templateId);
    await logAudit(userId, 'rule.create_from_template', {
      targetType: 'rule', targetId: rule.id,
      details: { templateId, name: template.name },
    });
    return reply.code(201).send(rule);
  });

  app.get("/:accountId", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    return getRules(accountId);
  });

  // « Règles actives » KPI (Vue d'ensemble): `processed` is what handleRule stores in jobs.payload.result,
  // i.e. manual and scheduled runs.
  app.get("/:accountId/stats", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const db = getDb();
    const [rules, runs] = await Promise.all([
      db.selectFrom("rules").select(sql<string>`count(*)`.as("n"))
        .where("gmail_account_id", "=", accountId).where("is_active", "=", true)
        .executeTakeFirst(),
      db.selectFrom("jobs")
        .select(sql<string>`coalesce(sum((payload->'result'->>'processed')::int), 0)`.as("n"))
        .where("gmail_account_id", "=", accountId).where("type", "=", "run_rule").where("status", "=", "completed")
        .where("completed_at", ">=", new Date(Date.now() - 30 * 86_400_000))
        .executeTakeFirst(),
    ]);
    return { active: Number(rules?.n ?? 0), processed30d: Number(runs?.n ?? 0) };
  });

  app.get("/:accountId/:ruleId", accountAuth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    const rule = await getRule(ruleId, accountId);
    if (!rule) return notFound(reply, "Rule not found");
    return rule;
  });

  app.post("/:accountId", accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const dto = ruleCreateSchema.parse(request.body);
    const rule = await createRule(accountId, {
      ...dto,
      schedule: dto.schedule ?? undefined,
    });
    return reply.code(201).send(rule);
  });

  app.put("/:accountId/:ruleId", accountAuth, async (request) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    const dto = ruleCreateSchema.partial().parse(request.body);
    // dto.schedule: null = unschedule, undefined = unchanged
    return updateRule(ruleId, accountId, dto);
  });

  app.patch("/:accountId/:ruleId/toggle", accountAuth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    const rule = await getRule(ruleId, accountId);
    if (!rule) return notFound(reply, "Rule not found");
    return updateRule(ruleId, accountId, { is_active: !rule.is_active });
  });

  app.delete("/:accountId/:ruleId", accountAuth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    await deleteRule(ruleId, accountId);
    return reply.code(204).send();
  });

  app.post("/:accountId/:ruleId/run", accountAuth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    const userId = request.user.sub;
    const rule = await getRule(ruleId, accountId);
    if (!rule) return notFound(reply, "Rule not found");
    // D1 undo window, cancellable via DELETE /api/jobs/:jobId
    const { delayMs } = z
      .object({ delayMs: z.number().int().min(0).max(60_000).default(10_000) })
      .parse(request.body ?? {});
    const job = await enqueueJob("run_rule", { accountId, userId, ruleId }, { delay: delayMs });
    const runAt = new Date(Date.now() + delayMs).toISOString();
    return reply
      .code(202)
      .send({ jobId: job.id, runAt, message: "Rule execution enqueued" });
  });

  app.post("/:accountId/preview", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const conditions = conditionsSchema.parse((request.body as { conditions?: unknown })?.conditions);
    const query = buildGmailQuery(conditions);
    const res = await listMessages(accountId, { query, maxResults: 5 });
    const estimatedCount = res.resultSizeEstimate ?? 0;
    const ids = res.messages.map((m) => m.id!).filter(Boolean);
    if (estimatedCount === 0 || ids.length === 0) return { query, estimatedCount, samples: [], sizeBytes: 0 };
    const metas = await batchGetMessages(accountId, ids);
    const avgSize = metas.reduce((sum, m) => sum + m.sizeEstimate, 0) / metas.length;
    return {
      query,
      estimatedCount,
      samples: metas.map(({ id, from, subject, date }) => ({ id, from, subject, date })),
      sizeBytes: Math.round(avgSize * estimatedCount),
    };
  });
}
