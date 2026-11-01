import { getDb } from "../db";
import { enqueueJob } from "./queue";
import { recordInboxSnapshot } from "../analytics/analytics.service";
import { processExpiredEmails } from "../expiration/expiration.service";
import { cleanupExpiredShares } from "../archive/sharing.service";
import { syncAllLabels } from "../labels/labels.service";
import { countPendingBodyText } from "../archive/body-text";
import { createLogger } from '../logger'
import type { BackupInterval } from '../db/types'

const logger = createLogger('scheduler')

const HOUR = 3_600_000

/** A background task run at most once per `every` ms, optionally only during hour `atHour` (server time). */
type Periodic = { name: string; every: number; atHour?: number; run: (now: Date) => Promise<void> }

const PERIODIC: Periodic[] = [
  {
    name: 'integrity check', every: 24 * HOUR, atHour: 3,
    run: async () => { await enqueueJob('integrity_check', { accountId: '' }); logger.info('Enqueued daily integrity check') },
  },
  {
    name: 'inbox snapshots', every: 6 * HOUR,
    run: async () => {
      const accounts = await getDb().selectFrom('mail_accounts').select('id')
        .where('is_active', '=', true).where('provider', '=', 'gmail') // Gmail API figures
        .execute()
      for (const account of accounts) {
        await recordInboxSnapshot(account.id).catch((err) => logger.error({ err, accountId: account.id }, 'Inbox snapshot failed')) // NOSONAR: Gmail quota
      }
      logger.info(`Inbox zero snapshots recorded (${accounts.length} accounts)`)
    },
  },
  // 1 labels.list call per account
  { name: 'labels sync', every: 24 * HOUR, run: async () => { await syncAllLabels() } },
  {
    name: 'expired emails', every: HOUR / 4,
    run: async () => {
      const result = await processExpiredEmails()
      if (result.processed > 0 || result.errors > 0) logger.info(`Expired emails: ${result.processed} trashed, ${result.errors} errors`)
    },
  },
  {
    name: 'share links cleanup', every: HOUR,
    run: async () => {
      const cleaned = await cleanupExpiredShares()
      if (cleaned > 0) logger.info(`Cleaned ${cleaned} expired share link(s)`)
    },
  },
  {
    name: 'archive trash purge', every: 24 * HOUR, atHour: 4,
    run: async () => { await enqueueJob('purge_archive_trash', { accountId: '' }); logger.info('Enqueued daily archive trash purge') },
  },
  // B12: each tick, per account interval
  { name: 'automatic backups', every: 0, run: enqueueDueBackups },
  { name: 'scheduled rules', every: 0, run: enqueueDueRules },
]

/** Active rules with a schedule that is due, on Gmail accounts that can run them. */
async function enqueueDueRules(now: Date) {
  const rules = await getDb()
    .selectFrom('rules')
    .innerJoin('mail_accounts', 'rules.account_id', 'mail_accounts.id')
    .select(['rules.id', 'rules.account_id', 'rules.schedule', 'rules.last_run_at', 'mail_accounts.email as account_email', 'mail_accounts.user_id'])
    .where('rules.is_active', '=', true)
    .where('mail_accounts.is_active', '=', true) // disconnected accounts have no Gmail access
    .where('mail_accounts.provider', '=', 'gmail') // rules act through the Gmail API
    .where('mail_accounts.auth_error_at', 'is', null) // pending reconnection: every run would fail and notify
    .where('rules.schedule', 'is not', null)
    .execute()

  for (const rule of rules) {
    if (!rule.schedule || !shouldRun(rule.schedule, rule.last_run_at, now)) continue
    // last_run_at is only written once the rule ran, so dedupe the minutes it waits in the queue
    await enqueueJob('run_rule', { accountId: rule.account_id, userId: rule.user_id, ruleId: rule.id }, { dedupId: `run_rule-${rule.id}` }) // NOSONAR
    logger.info(`Enqueued rule ${rule.id} (${rule.account_email})`)
  }
}

// Simple cron scheduler — every minute, runs the background tasks that are due.
// En production, remplacer par BullMQ repeatable jobs ou un vrai cron (node-cron).
export function startRuleScheduler() {
  const INTERVAL_MS = 60 * 1000 // toutes les minutes
  const lastRun = new Map<string, number>()

  async function tick() {
    const now = new Date()
    for (const task of PERIODIC) {
      const last = lastRun.get(task.name)
      if (last !== undefined && now.getTime() - last <= task.every) continue
      if (task.atHour !== undefined && now.getHours() !== task.atHour) continue
      try {
        await task.run(now) // NOSONAR: tasks one after the other, each logs its own outcome
        lastRun.set(task.name, now.getTime())
      } catch (err) {
        // One failing task no longer skips the others; it is retried next tick
        logger.error({ err, task: task.name }, 'Scheduled task failed')
      }
    }
  }

  // Démarrer la boucle
  void enqueueBodyTextBackfill() // logs its own errors
  setInterval(tick, INTERVAL_MS)
  logger.info('Rule scheduler started (1min interval)')
}

const BACKUP_INTERVAL_MS: Record<BackupInterval, number> = { '1h': 3_600_000, '6h': 6 * 3_600_000, '24h': 24 * 3_600_000 };

/**
 * B12: differential NAS backup of each account whose automatic backup is on and due. Accounts waiting for a
 * reconnection (auth_error_at) are skipped: the job would only fail. last_backup_at is written at enqueue time
 * so a long backup is not enqueued again every minute (dedupId covers the job still in the queue).
 */
export async function enqueueDueBackups(now: Date) {
  const db = getDb();
  const accounts = await db
    .selectFrom('mail_accounts')
    .select(['id', 'user_id', 'backup_interval', 'last_backup_at'])
    .where('is_active', '=', true)
    .where('backup_enabled', '=', true)
    .where('auth_error_at', 'is', null)
    .execute();

  const due = accounts.filter((a) => now.getTime() - (a.last_backup_at ? new Date(a.last_backup_at).getTime() : 0) >= BACKUP_INTERVAL_MS[a.backup_interval]);
  // Accounts are independent: enqueued side by side, each stamped once its job is queued
  await Promise.all(due.map(async (account) => {
    await enqueueJob('archive_mails', { accountId: account.id, userId: account.user_id, differential: true }, { dedupId: `backup-${account.id}` });
    await db.updateTable('mail_accounts').set({ last_backup_at: now }).where('id', '=', account.id).execute();
    logger.info(`Enqueued automatic backup (${account.id}, every ${account.backup_interval})`);
  }));
}

/** B2: once at startup, fill body_text of mails archived before migration 007 (fixed dedupId: one backfill at a time). */
export async function enqueueBodyTextBackfill() {
  try {
    if ((await countPendingBodyText()) === 0) return;
    await enqueueJob('backfill_body_text', { accountId: '' }, { dedupId: 'backfill_body_text' });
    logger.info('Enqueued body_text backfill');
  } catch (err) {
    logger.error({ err }, 'body_text backfill enqueue failed');
  }
}

// ─── Vérification simplifiée de schedule ──────────────────
// Supporte : 'daily', 'weekly', 'monthly', et expressions cron H H * * *
// Pour une vraie lib cron : utiliser `cronstrue` ou `node-cron`

function shouldRun(
  schedule: string,
  lastRunAt: Date | null,
  now: Date,
): boolean {
  if (!lastRunAt) return true; // jamais exécutée → on la lance

  const diffMs = now.getTime() - new Date(lastRunAt).getTime();
  const diffH = diffMs / 1000 / 3600;

  switch (schedule) {
    case "hourly":
      return diffH >= 1;
    case "daily":
      return diffH >= 24;
    case "weekly":
      return diffH >= 24 * 7;
    case "monthly":
      return diffH >= 24 * 30;
    default:
      // Pour les expressions cron réelles, on retourne false
      // (à implémenter avec node-cron si besoin)
      return false;
  }
}
