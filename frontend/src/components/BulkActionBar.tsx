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
  if (!selected.length) return null;

  const userLabels = labels.filter((l) => l.type === "user");

  return (
    <div
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
        {selected.length} mail{selected.length > 1 ? "s" : ""} sélectionné
        {selected.length > 1 ? "s" : ""}
      </Text>

      <Divider type="vertical" />

      <Space wrap size="small">
        <Tooltip title="Supprimer (corbeille)">
          <Button
            icon={<DeleteOutlined />}
            size="small"
            onClick={() => onBulkAction("trash")}
            loading={loading}
          >
            Corbeille
          </Button>
        </Tooltip>

        <Popconfirm
          title="Supprimer définitivement ?"
          description={`${selected.length} mail(s) seront supprimés de façon irréversible.`}
          onConfirm={() => onBulkAction("delete")}
          okText="Supprimer"
          okButtonProps={{ danger: true }}
          cancelText="Annuler"
          icon={<ExclamationCircleOutlined style={{ color: "red" }} />}
        >
          <Tooltip title="Suppression définitive — irréversible">
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={loading}
            >
              Supprimer
            </Button>
          </Tooltip>
        </Popconfirm>

        <Tooltip title="Archiver (retirer de INBOX)">
          <Button
            icon={<InboxOutlined />}
            size="small"
            onClick={() => onBulkAction("archive")}
            loading={loading}
          >
            Archiver Gmail
          </Button>
        </Tooltip>

        <Tooltip title="Archiver sur le NAS (EML)">
          <Button
            icon={<CloudDownloadOutlined />}
            size="small"
            onClick={() => onBulkAction("archive_nas")}
            loading={loading}
          >
            Archiver NAS
          </Button>
        </Tooltip>

        <Button
          icon={<EyeOutlined />}
          size="small"
          onClick={() => onBulkAction("mark_read")}
          loading={loading}
        >
          Marquer lu
        </Button>

        <Button
          icon={<EyeInvisibleOutlined />}
          size="small"
          onClick={() => onBulkAction("mark_unread")}
          loading={loading}
        >
          Non lu
        </Button>

        {userLabels.length > 0 && (
          <Select
            placeholder={
              <>
                <TagOutlined /> Ajouter un label
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
