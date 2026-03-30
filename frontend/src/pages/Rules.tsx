import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Switch,
  Popconfirm,
  Tooltip,
  notification,
  message,
  Card,
  Empty,
  Drawer,
  List,
} from "antd";
import {
  PlusOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { rulesApi, gmailApi } from "../api";
import { useAccount } from "../hooks/useAccount";
import {
  Rule,
  ACTION_LABELS,
  CONDITION_FIELD_LABELS,
  CONDITION_OPERATOR_LABELS,
  SCHEDULE_OPTIONS,
} from "../types/rules";
import RuleFormModal from "../components/RuleFormModal";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";

dayjs.extend(relativeTime);
dayjs.locale("fr");

const { Title, Text } = Typography;

export default function RulesPage() {
  const { accountId } = useAccount();
  const [rules, setRules] = useState<Rule[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [templateDrawer, setTemplateDrawer] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [r, l] = await Promise.all([
        rulesApi.list(accountId),
        gmailApi.listLabels(accountId),
      ]);
      setRules(r);
      setLabels(l);
    } catch {
      messageApi.error("Erreur lors du chargement des règles");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (rule: Rule) => {
    try {
      const updated = await rulesApi.toggle(accountId!, rule.id);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch {
      messageApi.error("Erreur lors du changement de statut");
    }
  };

  const handleRun = async (rule: Rule) => {
    setRunningId(rule.id);
    try {
      const { jobId } = await rulesApi.run(accountId!, rule.id);
      notification.success({
        message: `Règle "${rule.name}" lancée`,
        description: `Job #${jobId} créé. Suivez la progression dans Jobs.`,
        duration: 5,
      });
      load();
    } catch {
      messageApi.error("Erreur lors de l'exécution de la règle");
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (rule: Rule) => {
    try {
      await rulesApi.delete(accountId!, rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      messageApi.success("Règle supprimée");
    } catch {
      messageApi.error("Erreur lors de la suppression");
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setModalOpen(true);
  };
  const openEdit = (rule: Rule) => {
    setEditingRule(rule);
    setModalOpen(true);
  };
  const handleSaved = () => {
    setModalOpen(false);
    load();
  };

  const openTemplates = async () => {
    setTemplateDrawer(true);
    if (templates.length === 0) {
      setTemplateLoading(true);
      try {
        const data = await rulesApi.getTemplates();
        setTemplates(data);
      } catch {
        messageApi.error("Erreur lors du chargement des templates");
      } finally {
        setTemplateLoading(false);
      }
    }
  };

  const applyTemplate = async (templateId: string) => {
    if (!accountId) return;
    try {
      await rulesApi.createFromTemplate(accountId, templateId);
      messageApi.success("Règle créée depuis le template");
      setTemplateDrawer(false);
      load();
    } catch {
      messageApi.error("Erreur lors de la création");
    }
  };

  const scheduleLabel = (s: string | null) =>
    SCHEDULE_OPTIONS.find((o) => o.value === s)?.label ?? "Manuel";

  const columns = [
    {
      title: "Statut",
      dataIndex: "is_active",
      width: 80,
      render: (active: boolean, row: Rule) => (
        <Switch
          size="small"
          checked={active}
          onChange={() => handleToggle(row)}
          checkedChildren="ON"
          unCheckedChildren="OFF"
        />
      ),
    },
    {
      title: "Règle",
      render: (_: any, row: Rule) => (
        <Space direction="vertical" size={2}>
          <Text strong>{row.name}</Text>
          {row.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Conditions",
      dataIndex: "conditions",
      render: (conditions: Rule["conditions"]) => (
        <Space direction="vertical" size={2}>
          {conditions.map((c, i) => (
            <Tag key={i} style={{ fontSize: 11 }}>
              {CONDITION_FIELD_LABELS[c.field]}{" "}
              <Text type="secondary">
                {CONDITION_OPERATOR_LABELS[c.operator]}
              </Text>{" "}
              {c.field !== "has_attachment" && (
                <strong>{String(c.value)}</strong>
              )}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      width: 200,
      render: (action: Rule["action"]) => {
        const label = labels.find((l) => l.id === action.labelId);
        return (
          <Space>
            <Tag color="blue">{ACTION_LABELS[action.type]}</Tag>
            {label && <Tag>{label.name}</Tag>}
          </Space>
        );
      },
    },
    {
      title: "Planification",
      dataIndex: "schedule",
      width: 150,
      render: (s: string | null, row: Rule) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            {s ? <ClockCircleOutlined style={{ color: "#1677ff" }} /> : null}
            <Text style={{ fontSize: 12 }}>{scheduleLabel(s)}</Text>
          </Space>
          {row.last_run_at && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <CheckCircleOutlined style={{ color: "#52c41a" }} />{" "}
              {dayjs(row.last_run_at).fromNow()}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "",
      width: 130,
      render: (_: any, row: Rule) => (
        <Space size="small">
          <Tooltip title="Exécuter maintenant">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<PlayCircleOutlined />}
              loading={runningId === row.id}
              onClick={() => handleRun(row)}
              disabled={!row.is_active}
            />
          </Tooltip>
          <Tooltip title="Modifier">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(row)}
            />
          </Tooltip>
          <Popconfirm
            title="Supprimer cette règle ?"
            onConfirm={() => handleDelete(row)}
            okText="Supprimer"
            okButtonProps={{ danger: true }}
            cancelText="Annuler"
          >
            <Tooltip title="Supprimer">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}

      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={3} style={{ margin: 0 }}>
          🤖 Règles automatiques
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Nouvelle règle
        </Button>
        <Button icon={<AppstoreOutlined />} onClick={openTemplates}>
          Templates
        </Button>
      </Space>

      <Card
        size="small"
        style={{
          marginBottom: 16,
          background: "#f6ffed",
          borderColor: "#b7eb8f",
        }}
      >
        <Text style={{ fontSize: 13 }}>
          Les règles analysent votre boîte Gmail et appliquent des actions
          automatiquement. Utilisez <strong>Prévisualiser</strong> pour voir
          combien de mails seront affectés avant de sauvegarder. Les actions
          bulk sont toujours exécutées via des <strong>jobs asynchrones</strong>
          .
        </Text>
      </Card>

      {!accountId ? (
        <Empty description="Aucun compte Gmail connecté" />
      ) : (
        <Table
          dataSource={rules}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                description="Aucune règle"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreate}
                >
                  Créer ma première règle
                </Button>
              </Empty>
            ),
          }}
        />
      )}

      <RuleFormModal
        open={modalOpen}
        accountId={accountId!}
        labels={labels}
        rule={editingRule}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      <Drawer
        title="📋 Templates de règles"
        open={templateDrawer}
        onClose={() => setTemplateDrawer(false)}
        width={480}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Cliquez sur un template pour créer une règle pré-configurée. Vous pourrez la modifier ensuite.
        </Text>
        <List
          loading={templateLoading}
          dataSource={templates}
          renderItem={(tpl: any) => (
            <List.Item
              actions={[
                <Button
                  key="apply"
                  type="primary"
                  size="small"
                  onClick={() => applyTemplate(tpl.id)}
                  disabled={!accountId}
                >
                  Activer
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={tpl.name}
                description={
                  <Space direction="vertical" size={2}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{tpl.description}</Text>
                    <Tag color={tpl.category === 'cleanup' ? 'red' : tpl.category === 'archive' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
                      {tpl.category === 'cleanup' ? '🧹 Nettoyage' : tpl.category === 'archive' ? '📦 Archivage' : '📁 Organisation'}
                    </Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  );
}
