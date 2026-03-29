import { getDb } from "../db";
import { enqueueJob } from "./queue";

// Simple cron scheduler — vérifie toutes les minutes si des règles
// planifiées doivent être exécutées.
// En production, remplacer par BullMQ repeateable jobs ou un vrai cron (node-cron).

export function startRuleScheduler() {
  const INTERVAL_MS = 60 * 1000; // toutes les minutes

  async function tick() {
    const db = getDb();

    try {
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
        ])
        .where("rules.is_active", "=", true)
        .where("rules.schedule", "is not", null)
        .execute();

      const now = new Date();

      for (const rule of rules) {
        if (rule.schedule && shouldRun(rule.schedule, rule.last_run_at, now)) {
          await enqueueJob("run_rule", {
            accountId: rule.gmail_account_id,
            ruleId: rule.id,
          });
          console.info(
            `[Scheduler] Enqueued rule ${rule.id} (${rule.account_email})`,
          );
        }
      }
    } catch (err) {
      console.error("[Scheduler] Error during tick:", err);
    }
  }

  // Démarrer la boucle
  setInterval(tick, INTERVAL_MS);
  console.info("✅ Rule scheduler started (1min interval)");
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
