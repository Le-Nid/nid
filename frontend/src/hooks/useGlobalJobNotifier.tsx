import { useEffect, useRef, useState } from "react";
import { notification } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { jobsApi, notificationsApi } from "../api";
import { useAccount } from "./useAccount";

const TYPE_LABELS: Record<string, string> = {
  bulk_operation: "Opération bulk",
  archive_mails: "Archivage NAS",
  run_rule: "Règle automatique",
  sync_dashboard: "Sync dashboard",
};

/**
 * Lance un poll léger (5s) sur les jobs actifs du compte courant.
 * Quand un job passe à completed/failed, affiche une notification Ant Design.
 * Respecte la préférence `toast_enabled` de l'utilisateur.
 * Doit être monté une seule fois dans AppLayout.
 */
export function useGlobalJobNotifier() {
  const { accountId } = useAccount();
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

          if (prev && prev !== "completed" && curr === "completed" && prefs.job_completed_toast !== false) {
            notification.success({
              key: `job-${job.id}`,
              title: `${TYPE_LABELS[job.type] ?? job.type} terminé`,
              description: `${job.processed ?? 0} éléments traités avec succès.`,
              icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
              duration: 6,
            });
          }

          if (prev && prev !== "failed" && curr === "failed" && prefs.job_failed_toast !== false) {
            notification.error({
              key: `job-${job.id}`,
              title: `${TYPE_LABELS[job.type] ?? job.type} échoué`,
              description: job.error ?? "Une erreur est survenue.",
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
