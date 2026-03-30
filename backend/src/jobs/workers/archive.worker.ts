import { Worker, Job } from "bullmq";
import { getRedis } from "../../plugins/redis";
import { getDb } from "../../db";
import { archiveMail, getArchivedIds } from "../../archive/archive.service";
import { listMessages } from "../../gmail/gmail.service";

interface ArchivePayload {
  accountId: string;
  userId?: string;
  messageIds?: string[];
  query?: string;
  differential?: boolean;
}

export function startArchiveWorker() {
  const worker = new Worker<ArchivePayload>(
    "gmail-manager",
    async (job: Job<ArchivePayload>) => {
      if (job.name !== "archive_mails") return;
      const { accountId, messageIds, query, differential = true } = job.data;
      const db = getDb();

      let ids: string[] = messageIds ?? [];

      if (!ids.length && query) {
        let pageToken: string | null = null;
        do {
          const res: any = await listMessages(accountId, {
            query,
            maxResults: 500,
            pageToken: pageToken ?? undefined,
          });
          ids.push(...(res.messages ?? []).map((m: any) => m.id));
          pageToken = res.nextPageToken;
        } while (pageToken);
      }

      if (differential) {
        const archived = await getArchivedIds(accountId);
        ids = ids.filter((id) => !archived.has(id));
      }

      const total = ids.length;

      await db
        .insertInto("jobs")
        .values({
          bullmq_id: String(job.id),
          type: "archive_mails",
          status: "active",
          total,
          gmail_account_id: accountId,
          user_id: job.data.userId ?? null,
          payload: JSON.stringify(job.data),
        })
        .onConflict((oc: any) => oc.doNothing())
        .execute();

      let processed = 0;
      for (const messageId of ids) {
        try {
          await archiveMail(accountId, messageId);
        } catch (err) {
          console.error(`Failed to archive ${messageId}:`, err);
        }
        processed++;
        const progress = Math.round((processed / total) * 100);
        await job.updateProgress(progress);

        if (processed % 10 === 0) {
          await db
            .updateTable("jobs")
            .set({ progress, processed })
            .where("bullmq_id", "=", String(job.id))
            .execute();
        }
      }

      await db
        .updateTable("jobs")
        .set({
          status: "completed",
          progress: 100,
          processed: total,
          completed_at: new Date(),
        })
        .where("bullmq_id", "=", String(job.id))
        .execute();
    },
    { connection: getRedis(), concurrency: 1 },
  );
  return worker;
}
