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
import { useTranslation } from "react-i18next";
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
import "dayjs/locale/en";

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

export default function RulesPage() {
  const { t, i18n } = useTranslation();
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
      messageApi.error(t('rules.loadError'));
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
      messageApi.error(t('rules.toggleError'));
    }
  };

  const handleRun = async (rule: Rule) => {
    setRunningId(rule.id);
    try {
      const { jobId } = await rulesApi.run(accountId!, rule.id);
      notification.success({
        title: t('rules.runSuccess', { name: rule.name }),
        description: t('rules.runJobCreated', { jobId }),
        duration: 5,
      });
      load();
    } catch {
      messageApi.error(t('rules.runError'));
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (rule: Rule) => {
    try {
      await rulesApi.delete(accountId!, rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      messageApi.success(t('rules.deleteSuccess'));
    } catch {
      messageApi.error(t('rules.deleteError'));
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
        messageApi.error(t('rules.templateLoadError'));
      } finally {
        setTemplateLoading(false);
      }
    }
  };

  const applyTemplate = async (templateId: string) => {
    if (!accountId) return;
    try {
      await rulesApi.createFromTemplate(accountId, templateId);
      messageApi.success(t('rules.templateApplied'));
      setTemplateDrawer(false);
      load();
    } catch {
      messageApi.error(t('rules.deleteError'));
    }
  };

  const scheduleLabel = (s: string | null) =>
    SCHEDULE_OPTIONS.find((o) => o.value === s)?.label ?? t('ruleLabels.manualOnly');

  const columns = [
    {
      title: t('rules.status'),
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
      title: t('rules.rule'),
      render: (_: any, row: Rule) => (
        <Space orientation="vertical" size={2}>
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
      title: t('rules.conditions'),
      dataIndex: "conditions",
      render: (conditions: Rule["conditions"]) => (
        <Space orientation="vertical" size={2}>
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
      title: t('rules.action'),
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
      title: t('rules.schedule'),
      dataIndex: "schedule",
      width: 150,
      render: (s: string | null, row: Rule) => (
        <Space orientation="vertical" size={0}>
          <Space size={4}>
            {s ? <ClockCircleOutlined style={{ color: "#1677ff" }} /> : null}
            <Text style={{ fontSize: 12 }}>{scheduleLabel(s)}</Text>
          </Space>
          {row.last_run_at && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <CheckCircleOutlined style={{ color: "#52c41a" }} />{" "}
              {dayjs(row.last_run_at).locale(i18n.language).fromNow()}
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
          <Tooltip title={t('rules.runNow')}>
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
          <Tooltip title={t('common.edit')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(row)}
            />
          </Tooltip>
          <Popconfirm
            title={t('rules.deleteRule') + ' ?'}
            onConfirm={() => handleDelete(row)}
            okText={t('common.delete')}
            okButtonProps={{ danger: true }}
            cancelText={t('common.cancel')}
          >
            <Tooltip title={t('rules.deleteRule')}>
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
          {t('rules.title')}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('rules.newRule')}
        </Button>
        <Button icon={<AppstoreOutlined />} onClick={openTemplates}>
          {t('rules.templates')}
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
                <Text style={{ fontSize: 13 }}>{t('rules.description')}</Text>
      </Card>

      {!accountId ? (
        <Empty description={t('rules.noAccount')} />
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
                description={t('rules.noRules')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreate}
                >
                  {t('rules.createFirst')}
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
        title={t('rules.templateDrawerTitle')}
        open={templateDrawer}
        onClose={() => setTemplateDrawer(false)}
        width={480}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {t('rules.templateHint')}
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
                  <Space orientation="vertical" size={2}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{tpl.description}</Text>
                    <Tag color={tpl.category === 'cleanup' ? 'red' : tpl.category === 'archive' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
                      {tpl.category === 'cleanup' ? t('rules.categoryCleanup') : tpl.category === 'archive' ? t('rules.categoryArchive') : t('rules.categoryOrganize')}
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
