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

const conditionSchema = z.object({
  field: z.enum([
    "from",
    "to",
    "subject",
    "has_attachment",
    "size_gt",
    "size_lt",
    "label",
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
  const auth = { preHandler: [app.authenticate] };

  app.get("/:accountId", auth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    return getRules(accountId);
  });

  app.get("/:accountId/:ruleId", auth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    const rule = await getRule(ruleId, accountId);
    if (!rule) return reply.code(404).send({ error: "Rule not found" });
    return rule;
  });

  app.post("/:accountId", auth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const dto = ruleCreateSchema.parse(request.body);
    const rule = await createRule(accountId, {
      ...dto,
      schedule: dto.schedule ?? undefined,
    });
    return reply.code(201).send(rule);
  });

  app.put("/:accountId/:ruleId", auth, async (request) => {
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

  app.patch("/:accountId/:ruleId/toggle", auth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    const rule = await getRule(ruleId, accountId);
    if (!rule) return reply.code(404).send({ error: "Rule not found" });
    return updateRule(ruleId, accountId, { is_active: !rule.is_active });
  });

  app.delete("/:accountId/:ruleId", auth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    await deleteRule(ruleId, accountId);
    return reply.code(204).send();
  });

  app.post("/:accountId/:ruleId/run", auth, async (request, reply) => {
    const { accountId, ruleId } = request.params as {
      accountId: string;
      ruleId: string;
    };
    const rule = await getRule(ruleId, accountId);
    if (!rule) return reply.code(404).send({ error: "Rule not found" });
    const job = await enqueueJob("run_rule", { accountId, ruleId });
    return reply
      .code(202)
      .send({ jobId: job.id, message: "Rule execution enqueued" });
  });

  app.post("/:accountId/preview", auth, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const { conditions } = request.body as { conditions: any[] };
    const query = buildGmailQuery(conditions);
    const res = await listMessages(accountId, { query, maxResults: 1 });
    return { query, estimatedCount: res.resultSizeEstimate ?? 0 };
  });
}
