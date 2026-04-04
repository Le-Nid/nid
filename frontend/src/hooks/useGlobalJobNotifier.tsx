import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { jobsApi, notificationsApi } from "../api";
import { useAccount } from "./useAccount";
import { useTranslation } from "react-i18next";

const TYPE_LABEL_KEYS: Record<string, string> = {
  bulk_operation: "notifier.typeBulk",
  archive_mails: "notifier.typeArchive",
  run_rule: "notifier.typeRule",
  sync_dashboard: "notifier.typeSync",
};

/**
 * Lance un poll léger (5s) sur les jobs actifs du compte courant.
 * Quand un job passe à completed/failed, affiche une notification Ant Design.
 * Respecte la préférence `toast_enabled` de l'utilisateur.
 * Doit être monté une seule fois dans AppLayout.
 */
export function useGlobalJobNotifier() {
  const { accountId } = useAccount();
  const { notification } = App.useApp();
  const { t } = useTranslation();
  const knownStates = useRef<Map<string, string>>(new Map());
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  // Load toast preferences once
  useEffect(() => {
    notificationsApi.getPreferences()
      .then((p) => setPrefs(p))
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

          if (prev && prev !== "completed" && curr === "completed" && prefs.job_completed_toast !== false) {
            notification.success({
              key: `job-${job.id}`,
              message: t('notifier.completed', { type: typeLabel }),
              description: t('notifier.processedCount', { count: job.processed ?? 0 }),
              icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
              duration: 6,
            });
          }

          if (prev && prev !== "failed" && curr === "failed" && prefs.job_failed_toast !== false) {
            notification.error({
              key: `job-${job.id}`,
              message: t('notifier.failed', { type: typeLabel }),
              description: job.error ?? t('notifier.genericError'),
              icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
              duration: 10,
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
  }, [accountId]);
}
