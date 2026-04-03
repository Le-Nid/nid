import { Worker, Job } from "bullmq";
import { getRedis } from "../../plugins/redis";
import { getDb } from "../../db";
import { notify } from "../../notifications/notify";
import { getRule, runRule } from "../../rules/rules.service";

interface RunRulePayload {
  accountId: string;
  userId?: string;
  ruleId: string;
}

export function startRuleWorker() {
  const worker = new Worker<RunRulePayload>(
    "nid",
    async (job: Job<RunRulePayload>) => {
      if (job.name !== "run_rule") return;
      const { accountId, ruleId } = job.data;
      const db = getDb();

      await db
        .updateTable("jobs")
        .set({ status: "active" })
        .where("bullmq_id", "=", String(job.id))
        .execute();

      try {
        const rule = await getRule(ruleId, accountId);
        if (!rule) throw new Error(`Rule ${ruleId} not found`);
        if (!rule.is_active) throw new Error(`Rule ${ruleId} is disabled`);

        const result = await runRule(rule, accountId);

        await db
          .updateTable("jobs")
          .set({
            status: "completed",
            progress: 100,
            completed_at: new Date(),
            payload: JSON.stringify({ ...job.data, result }),
          })
          .where("bullmq_id", "=", String(job.id))
          .execute();

        if (job.data.userId) {
          await notify({
            userId: job.data.userId,
            category: 'rule_executed',
            title: `Règle "${rule.name}" exécutée`,
            body: `${result?.processed ?? 0} mail(s) traité(s).`,
            data: { jobId: String(job.id), ruleId, ruleName: rule.name },
          })
        }

        return result;
      } catch (err) {
        await db
          .updateTable("jobs")
          .set({ status: "failed", error: String(err) })
          .where("bullmq_id", "=", String(job.id))
          .execute();

        if (job.data.userId) {
          await notify({
            userId: job.data.userId,
            category: 'job_failed',
            title: `Règle échouée`,
            body: String(err),
            data: { jobId: String(job.id), ruleId },
          })
        }
        throw err;
      }
    },
    { connection: getRedis(), concurrency: 2 },
  );
  worker.on("failed", (job, err) =>
    console.error(`Rule job ${job?.id} failed:`, err.message),
  );
  return worker;
}
