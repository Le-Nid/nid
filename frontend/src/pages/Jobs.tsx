import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Tag,
  Progress,
  Button,
  Typography,
  Space,
  Tooltip,
  Badge,
  Select,
  Empty,
} from "antd";
import { DeleteOutlined, ReloadOutlined, EyeOutlined } from "@ant-design/icons";
import { jobsApi } from "../api";
import { useAccount } from "../hooks/useAccount";
import JobProgressModal from "../components/JobProgressModal";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";

dayjs.extend(relativeTime);
dayjs.locale("fr");

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  pending: "default",
  active: "processing",
  completed: "success",
  failed: "error",
  cancelled: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  active: "En cours",
  completed: "Terminé",
  failed: "Échoué",
  cancelled: "Annulé",
};

const TYPE_LABEL: Record<string, string> = {
  bulk_operation: "Opération bulk",
  archive_mails: "Archivage NAS",
  run_rule: "Règle auto",
  sync_dashboard: "Sync dashboard",
};

export default function JobsPage() {
  const { accountId } = useAccount();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [watchingJobId, setWatchingJobId] = useState<string | null>(null);

  const hasActiveJobs = jobs.some((j) =>
    ["active", "pending"].includes(j.status),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (accountId) params.accountId = accountId;
      if (statusFilter) params.status = statusFilter;
      const data = await jobsApi.list(params);
      setJobs(data);
    } finally {
      setLoading(false);
    }
  }, [accountId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Polling léger uniquement quand des jobs sont actifs
  // (le SSE s'occupe des détails d'un job spécifique via la modal)
  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJobs, load]);

  const cancelJob = async (jobId: string) => {
    await jobsApi.cancel(jobId);
    load();
  };

  const columns = [
    {
      title: "Type",
      dataIndex: "type",
      width: 160,
      render: (t: string) => <Text strong>{TYPE_LABEL[t] ?? t}</Text>,
    },
    {
      title: "Statut",
      dataIndex: "status",
      width: 120,
      render: (s: string) => (
        <Badge
          status={STATUS_COLOR[s] as any}
          text={<Text style={{ fontSize: 12 }}>{STATUS_LABEL[s] ?? s}</Text>}
        />
      ),
    },
    {
      title: "Progression",
      width: 240,
      render: (_: any, record: any) => (
        <Space direction="vertical" size={2} style={{ width: "100%" }}>
          <Progress
            percent={record.progress ?? 0}
            size="small"
            format={() => `${record.processed ?? 0} / ${record.total ?? 0}`}
            status={
              record.status === "failed"
                ? "exception"
                : record.status === "completed"
                  ? "success"
                  : "active"
            }
          />
        </Space>
      ),
    },
    {
      title: "Compte",
      dataIndex: "gmail_account_id",
      width: 120,
      ellipsis: true,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {v?.slice(0, 8)}…
        </Text>
      ),
    },
    {
      title: "Créé",
      dataIndex: "created_at",
      width: 130,
      render: (d: string) => (
        <Tooltip title={dayjs(d).format("DD/MM/YYYY HH:mm:ss")}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(d).fromNow()}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: "Durée",
      width: 90,
      render: (_: any, record: any) => {
        if (!record.completed_at) return <Text type="secondary">—</Text>;
        const diff = dayjs(record.completed_at).diff(
          dayjs(record.created_at),
          "second",
        );
        return <Text style={{ fontSize: 12 }}>{diff}s</Text>;
      },
    },
    {
      title: "Erreur",
      dataIndex: "error",
      ellipsis: true,
      render: (e: string) =>
        e ? (
          <Tooltip title={e}>
            <Tag color="error" style={{ cursor: "pointer", maxWidth: 120 }}>
              <Text ellipsis style={{ maxWidth: 100, fontSize: 11 }}>
                {e}
              </Text>
            </Tag>
          </Tooltip>
        ) : null,
    },
    {
      title: "",
      width: 80,
      render: (_: any, record: any) => (
        <Space size="small">
          {/* Bouton SSE — ouvrir la modal de suivi temps réel */}
          <Tooltip title="Suivre en temps réel">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={() => setWatchingJobId(record.id)}
            />
          </Tooltip>

          {/* Annuler si en cours */}
          {["active", "pending"].includes(record.status) && (
            <Tooltip title="Annuler">
              <Button
                danger
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => cancelJob(record.id)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} align="center" wrap>
        <Title level={3} style={{ margin: 0 }}>
          ⚙️ Jobs
        </Title>

        <Select
          allowClear
          placeholder="Filtrer par statut"
          style={{ width: 180 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "pending", label: "En attente" },
            { value: "active", label: "En cours" },
            { value: "completed", label: "Terminés" },
            { value: "failed", label: "Échoués" },
            { value: "cancelled", label: "Annulés" },
          ]}
        />

        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Rafraîchir
        </Button>

        {hasActiveJobs && (
          <Badge
            status="processing"
            text={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Actualisation auto toutes les 5s
              </Text>
            }
          />
        )}
      </Space>

      {jobs.length === 0 && !loading ? (
        <Empty description="Aucun job" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table
          dataSource={jobs}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 25, size: "small" }}
          rowClassName={(r) =>
            r.status === "active" ? "ant-table-row-active" : ""
          }
        />
      )}

      {/* Modal SSE temps réel */}
      <JobProgressModal
        jobId={watchingJobId}
        onClose={() => setWatchingJobId(null)}
      />
    </div>
  );
}
