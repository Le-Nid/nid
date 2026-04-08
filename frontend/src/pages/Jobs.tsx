import { useState, useEffect } from "react";
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
  Card,
  InputNumber,
  Switch,
  Divider,
  message,
} from "antd";
import { Trash2, RefreshCw, Eye, CalendarClock, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAccount } from "../hooks/useAccount";
import { useJobs, useCancelJob, useArchiveTrashConfig } from "../hooks/queries";
import { archiveApi } from "../api";
import JobProgressModal from "../components/JobProgressModal";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";
import "dayjs/locale/en";

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

import { STATUS_COLORS } from "../utils/constants";

export default function JobsPage() {
  const { t } = useTranslation();
  const { accountId } = useAccount();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [watchingJobId, setWatchingJobId] = useState<string | null>(null);

  const params: Record<string, any> = {};
  if (accountId) params.accountId = accountId;
  if (statusFilter) params.status = statusFilter;

  const { data: jobs = [], isLoading: loading, refetch } = useJobs(params);
  const cancelMutation = useCancelJob();
  const { data: trashConfig, refetch: refetchTrashConfig } = useArchiveTrashConfig();
  const [trashRetentionDays, setTrashRetentionDays] = useState<number | null>(null);
  const [trashPurgeEnabled, setTrashPurgeEnabled] = useState<boolean | null>(null);
  const [savingTrashConfig, setSavingTrashConfig] = useState(false);

  // Sync local state with fetched config
  useEffect(() => {
    if (trashConfig) {
      if (trashRetentionDays === null) setTrashRetentionDays(trashConfig.retentionDays);
      if (trashPurgeEnabled === null) setTrashPurgeEnabled(trashConfig.purgeEnabled);
    }
  }, [trashConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveJobs = jobs.some((j: any) =>
    ["active", "pending"].includes(j.status),
  );

  // Polling léger uniquement quand des jobs sont actifs
  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJobs, refetch]);

  const cancelJob = async (jobId: string) => {
    await cancelMutation.mutateAsync(jobId);
  };

  const columns = [
    {
      title: t('jobs.type'),
      dataIndex: "type",
      width: 160,
      render: (v: string) => <Text strong>{t(`jobs.${v === 'bulk_operation' ? 'bulkOperation' : v === 'archive_mails' ? 'archiveMails' : v === 'run_rule' ? 'runRule' : 'syncDashboard'}`, { defaultValue: v })}</Text>,
    },
    {
      title: t('jobs.status'),
      dataIndex: "status",
      width: 120,
      render: (s: string) => (
        <Badge
          status={STATUS_COLORS[s] as any}
          text={<Text style={{ fontSize: 12 }}>{t(`jobs.${s}`, { defaultValue: s })}</Text>}
        />
      ),
    },
    {
      title: t('jobs.progress'),
      width: 240,
      render: (_: any, record: any) => (
        <Space orientation="vertical" size={2} style={{ width: "100%" }}>
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
      title: t('jobs.account'),
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
      title: t('jobs.created'),
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
      title: t('jobs.duration'),
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
      title: t('jobs.errorCol'),
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
              icon={<Eye size={14} />}
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
                icon={<Trash2 size={14} />}
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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          <CalendarClock size={20} style={{ marginRight: 8 }} />{t('jobs.title')}
        </Title>

        <Select
          allowClear
          placeholder={t('jobs.filterStatus')}
          style={{ width: 180 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "pending", label: t('jobs.pending') },
            { value: "active", label: t('jobs.active') },
            { value: "completed", label: t('jobs.completed') },
            { value: "failed", label: t('jobs.failed') },
            { value: "cancelled", label: t('jobs.cancelled') },
          ]}
        />

        <Button icon={<RefreshCw size={14} />} onClick={() => refetch()} loading={loading}>
          {t('common.refresh')}
        </Button>

        {hasActiveJobs && (
          <Badge
            status="processing"
            text={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('jobs.autoRefresh')}
              </Text>
            }
          />
        )}
      </div>

      {jobs.length === 0 && !loading ? (
        <Empty description={t('jobs.noJobs')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
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

      {/* Configuration corbeille archives */}
      <Divider />
      <Card
        title={
          <Space>
            <Settings size={16} />
            <span>{t('jobs.trashConfig')}</span>
          </Space>
        }
        size="small"
        style={{ maxWidth: 500 }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <span>{t('jobs.trashPurgeEnabled')}</span>
            <Switch
              checked={trashPurgeEnabled ?? true}
              onChange={(v) => setTrashPurgeEnabled(v)}
            />
          </Space>
          <Space>
            <span>{t('jobs.trashRetentionDays')}</span>
            <InputNumber
              min={1}
              max={365}
              value={trashRetentionDays ?? 30}
              onChange={(v) => setTrashRetentionDays(v)}
              disabled={!(trashPurgeEnabled ?? true)}
            />
          </Space>
          <Button
            type="primary"
            size="small"
            loading={savingTrashConfig}
            onClick={async () => {
              setSavingTrashConfig(true);
              try {
                await archiveApi.updateTrashConfig({
                  retentionDays: trashRetentionDays ?? 30,
                  purgeEnabled: trashPurgeEnabled ?? true,
                });
                refetchTrashConfig();
                message.success(t('jobs.trashConfigSaved'));
              } catch {
                message.error(t('jobs.trashConfigError'));
              } finally {
                setSavingTrashConfig(false);
              }
            }}
          >
            {t('common.save')}
          </Button>
        </Space>
      </Card>
    </div>
  );
}
