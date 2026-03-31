import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  runRule,
  buildGmailQuery,
} from "../rules/rules.service";
import { enqueueJob } from "../jobs/queue";
import { listMessages } from "../gmail/gmail.service";
import { RULE_TEMPLATES } from "../rules/rule-templates";
import { logAudit } from "../audit/audit.service";
import { notFound } from "../utils/db";
import { authPresets } from "../utils/auth";

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

const ruleCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  conditions: z.array(conditionSchema).min(1),
  action: actionSchema,
  schedule: z
    .enum(["hourly", "daily", "weekly", "monthly"])
    .nullable()
    .optional(),
  is_active: z.boolean().optional(),
});

export async function rulesRoutes(app: FastifyInstance) {
  const { auth, accountAuth } = authPresets(app);

  // ─── Templates ────────────────────────────────────────
  app.get("/templates", auth, async () => {
    return RULE_TEMPLATES;
  });

  app.post("/:accountId/from-template", accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const userId = request.user.sub;
    const { templateId } = request.body as { templateId: string };
    const template = RULE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return notFound(reply, "Template not found");
    const rule = await createRule(accountId, template.dto);
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
    return updateRule(ruleId, accountId, {
      ...dto,
      schedule: dto.schedule ?? undefined,
    });
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
    const job = await enqueueJob("run_rule", { accountId, userId, ruleId });
    return reply
      .code(202)
      .send({ jobId: job.id, message: "Rule execution enqueued" });
  });

  app.post("/:accountId/preview", accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const { conditions } = request.body as { conditions: any[] };
    const query = buildGmailQuery(conditions);
    const res = await listMessages(accountId, { query, maxResults: 1 });
    return { query, estimatedCount: res.resultSizeEstimate ?? 0 };
  });
}
