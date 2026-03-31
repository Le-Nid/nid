import {
  Space,
  Button,
  Select,
  Tooltip,
  Typography,
  Popconfirm,
  Divider,
} from "antd";
import {
  DeleteOutlined,
  TagOutlined,
  InboxOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ExclamationCircleOutlined,
  CloudDownloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface Label {
  id: string;
  name: string;
  type?: string;
}

interface Props {
  selected: string[];
  labels: Label[];
  onBulkAction: (action: string, labelId?: string) => void;
  loading: boolean;
}

export default function BulkActionBar({
  selected,
  labels,
  onBulkAction,
  loading,
}: Props) {
  const { t } = useTranslation();
  if (!selected.length) return null;

  const userLabels = labels.filter((l) => l.type === "user");

  return (
    <div
      role="toolbar"
      aria-label={t('bulk.selected', { count: selected.length })}
      style={{
        background: "#e6f4ff",
        border: "1px solid #91caff",
        borderRadius: 8,
        padding: "8px 16px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Text strong style={{ color: "#1677ff" }}>
        {t('bulk.selected', { count: selected.length })}
      </Text>

      <Divider orientation="vertical" />

      <Space wrap size="small">
        <Tooltip title={t('bulk.trashTooltip')}>
          <Button
            icon={<DeleteOutlined />}
            size="small"
            onClick={() => onBulkAction("trash")}
            loading={loading}
          >
            {t('bulk.trash')}
          </Button>
        </Tooltip>

        <Popconfirm
          title={t('bulk.permanentDeleteTitle')}
          description={t('bulk.permanentDeleteDesc', { count: selected.length })}
          onConfirm={() => onBulkAction("delete")}
          okText={t('common.delete')}
          okButtonProps={{ danger: true }}
          cancelText={t('common.cancel')}
          icon={<ExclamationCircleOutlined style={{ color: "red" }} />}
        >
          <Tooltip title={t('bulk.permanentDeleteTooltip')}>
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={loading}
            >
              {t('bulk.permanentDelete')}
            </Button>
          </Tooltip>
        </Popconfirm>

        <Tooltip title={t('bulk.archiveGmailTooltip')}>
          <Button
            icon={<InboxOutlined />}
            size="small"
            onClick={() => onBulkAction("archive")}
            loading={loading}
          >
            {t('bulk.archiveGmail')}
          </Button>
        </Tooltip>

        <Tooltip title={t('bulk.archiveNasTooltip')}>
          <Button
            icon={<CloudDownloadOutlined />}
            size="small"
            onClick={() => onBulkAction("archive_nas")}
            loading={loading}
          >
            {t('bulk.archiveNas')}
          </Button>
        </Tooltip>

        <Button
          icon={<EyeOutlined />}
          size="small"
          onClick={() => onBulkAction("mark_read")}
          loading={loading}
        >
          {t('bulk.markRead')}
        </Button>

        <Button
          icon={<EyeInvisibleOutlined />}
          size="small"
          onClick={() => onBulkAction("mark_unread")}
          loading={loading}
        >
          {t('bulk.markUnread')}
        </Button>

        {userLabels.length > 0 && (
          <Select
            placeholder={
              <>
                <TagOutlined /> {t('bulk.addLabel')}
              </>
            }
            size="small"
            style={{ minWidth: 160 }}
            onChange={(labelId) => labelId && onBulkAction("label", labelId)}
            options={userLabels.map((l) => ({ value: l.id, label: l.name }))}
            value={undefined}
          />
        )}
      </Space>
    </div>
  );
}
