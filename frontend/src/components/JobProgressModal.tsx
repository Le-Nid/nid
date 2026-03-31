import { Modal, Progress, Space, Typography, Tag, Alert } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { useJobSSE } from "../hooks/useJobSSE";
import { useTranslation } from "react-i18next";
import { STATUS_COLORS } from "../utils/constants";

const { Text } = Typography;

interface Props {
  jobId: string | null;
  onClose: () => void;
}

export default function JobProgressModal({ jobId, onClose }: Props) {
  const { t } = useTranslation();
  const { job, connected } = useJobSSE(jobId);

  const isTerminal =
    job && ["completed", "failed", "cancelled"].includes(job.status);

  return (
    <Modal
      open={!!jobId}
      onCancel={onClose}
      title={
        <Space>
          {job?.status === "active" ? (
            <LoadingOutlined spin style={{ color: "#1677ff" }} />
          ) : job?.status === "completed" ? (
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
          ) : job?.status === "failed" ? (
            <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
          ) : null}
          {job ? (() => {
            const typeKeyMap: Record<string, string> = {
              bulk_operation: 'bulkOperation', archive_mails: 'archiveMails',
              run_rule: 'runRule', scan_unsubscribe: 'scanUnsubscribe',
              scan_attachments: 'scanAttachments', generate_report: 'generateReport',
            };
            return t('jobs.' + (typeKeyMap[job.type] || job.type), { defaultValue: job.type });
          })() : t('common.loading')}
        </Space>
      }
      footer={null}
      width={480}
    >
      {job ? (
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          <Space>
            <Tag color={STATUS_COLORS[job.status]}>
              {job.status.toUpperCase()}
            </Tag>
            {!connected && !isTerminal && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('jobModal.reconnecting')}
              </Text>
            )}
          </Space>

          <Progress
            percent={job.progress}
            status={
              job.status === "failed"
                ? "exception"
                : job.status === "completed"
                  ? "success"
                  : "active"
            }
            format={() => `${job.processed ?? 0} / ${job.total ?? 0}`}
          />

          {job.error && (
            <Alert
              type="error"
              message={t('common.error')}
              description={job.error}
              showIcon
            />
          )}

          {job.status === "completed" && (
            <Alert
              type="success"
              message={t('jobModal.done', { count: job.processed })}
              showIcon
            />
          )}
        </Space>
      ) : (
        <Text type="secondary">{t('jobModal.connecting')}</Text>
      )}
    </Modal>
  );
}
