import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { jobsApi, notificationsApi } from "../api";
import { useAccount } from "./useAccount";
import { useTranslation } from "react-i18next";

const TYPE_LABEL_KEYS: Record<string, string> = {
  bulk_operation: "notifier.typeBulk",
  archive_mails: "notifier.typeArchive",
  run_rule: "notifier.typeRule",
};

/**
 * Lance un poll léger (5s) sur les jobs actifs du compte courant.
 * Quand un job passe à completed/failed, affiche un toast sonner.
 * Respecte la préférence `toast_enabled` de l'utilisateur.
 * Doit être monté une seule fois (AppShell).
 */
export function useGlobalJobNotifier() {
  const { accountId } = useAccount();
  const { t } = useTranslation();
  const knownStates = useRef<Map<string, string>>(new Map());
  // A ref: the poll below must see the preferences once they arrive
  const prefs = useRef<Record<string, boolean>>({});

  // Load toast preferences once
  useEffect(() => {
    notificationsApi.getPreferences()
      .then((p) => { prefs.current = p })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!accountId) return;

    async function poll() {
      try {
        const jobs = await jobsApi.list({ accountId, status: undefined });

        for (const job of jobs) {
          const prev = knownStates.current.get(job.id);
          const curr = job.status;
          const typeLabel = TYPE_LABEL_KEYS[job.type] ? t(TYPE_LABEL_KEYS[job.type]) : job.type;

          if (prev && prev !== "completed" && curr === "completed" && prefs.current.job_completed_toast !== false) {
            toast.success(t('notifier.completed', { type: typeLabel }), {
              id: `job-${job.id}`,
              description: t('notifier.processedCount', { count: job.processed ?? 0 }),
              duration: 6_000,
            });
          }

          if (prev && prev !== "failed" && curr === "failed" && prefs.current.job_failed_toast !== false) {
            toast.error(t('notifier.failed', { type: typeLabel }), {
              id: `job-${job.id}`,
              description: job.error ?? t('notifier.genericError'),
              duration: 10_000,
            });
          }

          knownStates.current.set(job.id, curr);
        }
      } catch {
        /* silencieux — ne pas polluer la console en cas de réseau */
      }
    }

    poll();
    const interval = setInterval(poll, 5_000);
    return () => clearInterval(interval);
  }, [accountId, t]);
}
