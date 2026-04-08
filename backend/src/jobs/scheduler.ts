import { getDb } from "../db";
import { enqueueJob } from "./queue";
import { recordInboxSnapshot } from "../analytics/analytics.service";
import { processExpiredEmails } from "../expiration/expiration.service";
import { cleanupExpiredShares } from "../archive/sharing.service";
import { createLogger } from '../logger'

const logger = createLogger('scheduler')

// Simple cron scheduler — vérifie toutes les minutes si des règles
// planifiées doivent être exécutées.
// En production, remplacer par BullMQ repeateable jobs ou un vrai cron (node-cron).

export function startRuleScheduler() {
  const INTERVAL_MS = 60 * 1000; // toutes les minutes

  let lastIntegrityCheck: Date | null = null;
  let lastInboxSnapshot: Date | null = null;
  let lastExpirationCheck: Date | null = null;
  let lastShareCleanup: Date | null = null;
  let lastTrashPurge: Date | null = null;

  async function tick() {
    const db = getDb();

    try {
      // ─── Integrity check — once per day ─────────────────
      const now = new Date();
      if (!lastIntegrityCheck || (now.getTime() - lastIntegrityCheck.getTime()) > 24 * 3600 * 1000) {
        if (now.getHours() === 3) { // Run at 3 AM
          await enqueueJob('integrity_check', { accountId: '' });
          lastIntegrityCheck = now;
          logger.info('Enqueued daily integrity check');
        }
      }

      // ─── Inbox Zero snapshots — toutes les 6h ────────────
      if (!lastInboxSnapshot || (now.getTime() - lastInboxSnapshot.getTime()) > 6 * 3600 * 1000) {
        const accounts = await db
          .selectFrom('gmail_accounts')
          .select('id')
          .where('is_active', '=', true)
          .execute();

        for (const account of accounts) {
          try {
            await recordInboxSnapshot(account.id);
          } catch (err) {
            logger.error({ err, accountId: account.id }, 'Inbox snapshot failed');
          }
        }
        lastInboxSnapshot = now;
        logger.info(`Inbox zero snapshots recorded (${accounts.length} accounts)`);
      }

      // ─── Process expired emails — every 15 min ─────────────
      if (!lastExpirationCheck || (now.getTime() - lastExpirationCheck.getTime()) > 15 * 60 * 1000) {
        try {
          const result = await processExpiredEmails();
          if (result.processed > 0 || result.errors > 0) {
            logger.info(`Expired emails: ${result.processed} trashed, ${result.errors} errors`);
          }
        } catch (err) {
          logger.error({ err }, 'Expiration processing failed');
        }
        lastExpirationCheck = now;
      }

      // ─── Cleanup expired share links — every hour ──────────
      if (!lastShareCleanup || (now.getTime() - lastShareCleanup.getTime()) > 3600 * 1000) {
        try {
          const cleaned = await cleanupExpiredShares();
          if (cleaned > 0) {
            logger.info(`Cleaned ${cleaned} expired share link(s)`);
          }
        } catch (err) {
          logger.error({ err }, 'Share cleanup failed');
        }
        lastShareCleanup = now;
      }

      // ─── Purge archive trash — once per day at 4 AM ────────
      if (!lastTrashPurge || (now.getTime() - lastTrashPurge.getTime()) > 24 * 3600 * 1000) {
        if (now.getHours() === 4) {
          await enqueueJob('purge_archive_trash', { accountId: '' });
          lastTrashPurge = now;
          logger.info('Enqueued daily archive trash purge');
        }
      }

      // Récupère les règles actives avec un schedule cron
      const rules = await db
        .selectFrom("rules")
        .innerJoin(
          "gmail_accounts",
          "rules.gmail_account_id",
          "gmail_accounts.id",
        )
        .select((eb) => [
          "rules.id",
          "rules.gmail_account_id",
          "rules.schedule",
          "rules.last_run_at",
          eb.ref("gmail_accounts.email").as("account_email") as any,
          eb.ref("gmail_accounts.user_id").as("user_id") as any,
        ])
        .where("rules.is_active", "=", true)
        .where("rules.schedule", "is not", null)
        .execute();

      for (const rule of rules) {
        if (rule.schedule && shouldRun(rule.schedule, rule.last_run_at, now)) {
          await enqueueJob("run_rule", {
            accountId: rule.gmail_account_id,
            userId: rule.user_id,
            ruleId: rule.id,
          });
          logger.info(
            `Enqueued rule ${rule.id} (${rule.account_email})`,
          );
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during tick');
    }
  }

  // Démarrer la boucle
  setInterval(tick, INTERVAL_MS);
  logger.info('Rule scheduler started (1min interval)');
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
