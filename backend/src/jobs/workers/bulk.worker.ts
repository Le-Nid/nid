import { Worker, Job } from "bullmq";
import { getRedis } from "../../plugins/redis";
import { getDb } from "../../db";
import { notify } from "../../notifications/notify";
import {
  trashMessages,
  deleteMessages,
  modifyMessages,
} from "../../gmail/gmail.service";

interface BulkPayload {
  accountId: string;
  userId?: string;
  action:
    | "trash"
    | "delete"
    | "label"
    | "unlabel"
    | "archive"
    | "mark_read"
    | "mark_unread";
  messageIds: string[];
  labelId?: string;
}

export function startBulkWorker() {
  const worker = new Worker<BulkPayload>(
    "gmail-manager",
    async (job: Job<BulkPayload>) => {
      if (job.name !== "bulk_operation") return;
      const { accountId, action, messageIds, labelId } = job.data;
      const db = getDb();
      const total = messageIds.length;

      await db
        .insertInto("jobs")
        .values({
          bullmq_id: String(job.id),
          type: "bulk_operation",
          status: "active",
          total,
          gmail_account_id: accountId,
          user_id: job.data.userId ?? null,
          payload: JSON.stringify(job.data),
        })
        .onConflict((oc: any) => oc.doNothing())
        .execute();

      const updateProgress = async (processed: number) => {
        const progress = Math.round((processed / total) * 100);
        await job.updateProgress(progress);
        await db
          .updateTable("jobs")
          .set({ progress, processed })
          .where("bullmq_id", "=", String(job.id))
          .execute();
      };

      try {
        switch (action) {
          case "trash":
            await trashMessages(accountId, messageIds);
            break;
          case "delete":
            await deleteMessages(accountId, messageIds);
            break;
          case "archive":
            await modifyMessages(accountId, messageIds, [], ["INBOX"]);
            break;
          case "mark_read":
            await modifyMessages(accountId, messageIds, [], ["UNREAD"]);
            break;
          case "mark_unread":
            await modifyMessages(accountId, messageIds, ["UNREAD"], []);
            break;
          case "label":
            if (!labelId) throw new Error("labelId required");
            await modifyMessages(accountId, messageIds, [labelId], []);
            break;
          case "unlabel":
            if (!labelId) throw new Error("labelId required");
            await modifyMessages(accountId, messageIds, [], [labelId]);
            break;
        }
        await updateProgress(total);
        await db
          .updateTable("jobs")
          .set({ status: "completed", completed_at: new Date() })
          .where("bullmq_id", "=", String(job.id))
          .execute();

        if (job.data.userId) {
          await notify({
            userId: job.data.userId,
            category: 'job_completed',
            title: `Opération bulk terminée`,
            body: `${total} élément(s) traité(s) (${action}).`,
            data: { jobId: String(job.id), action, count: total },
          })
        }
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
            title: `Opération bulk échouée`,
            body: String(err),
            data: { jobId: String(job.id), action },
          })
        }
        throw err;
      }
    },
    { connection: getRedis(), concurrency: 3 },
  );
  worker.on("failed", (job, err) =>
    console.error(`Bulk job ${job?.id} failed:`, err.message),
  );
  return worker;
}
