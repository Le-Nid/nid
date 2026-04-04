import { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Divider,
  Typography,
  Alert,
  InputNumber,
  Switch,
  Row,
  Col,
} from "antd";
import { PlusOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import {
  Rule,
  RuleCondition,
  RuleAction,
  ConditionField,
  CONDITION_FIELD_LABELS,
  ACTION_LABELS,
  SCHEDULE_OPTIONS,
  ActionType,
} from "../types/rules";
import { rulesApi } from "../api";

const { Text } = Typography;

// Opérateurs disponibles selon le champ
const OPERATORS_FOR_FIELD: Record<ConditionField, string[]> = {
  from: ["contains", "not_contains", "equals", "not_equals"],
  to: ["contains", "not_contains", "equals", "not_equals"],
  subject: ["contains", "not_contains", "equals", "not_equals"],
  has_attachment: ["is_true"],
  size_gt: ["gt"],
  size_lt: ["lt"],
  label: ["equals", "not_equals"],
  older_than: ["gt"],
  newer_than: ["gt"],
};

const ACTIONS_NEEDING_LABEL: ActionType[] = ["label", "unlabel"];

interface Props {
  open: boolean;
  accountId: string;
  labels: any[];
  rule?: Rule | null;
  onClose: () => void;
  onSaved: () => void;
}

const defaultCondition = (): RuleCondition => ({
  field: "from",
  operator: "contains",
  value: "",
});

export default function RuleFormModal({
  open,
  accountId,
  labels,
  rule,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [conditions, setConditions] = useState<RuleCondition[]>([
    defaultCondition(),
  ]);
  const [action, setAction] = useState<RuleAction>({ type: "trash" });
  const [schedule, setSchedule] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    query: string;
    estimatedCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rule) {
      form.setFieldsValue({ name: rule.name, description: rule.description });
      setConditions(rule.conditions);
      setAction(rule.action);
      setSchedule(rule.schedule ?? null);
      setIsActive(rule.is_active);
    } else {
      form.resetFields();
      setConditions([defaultCondition()]);
      setAction({ type: "trash" });
      setSchedule(null);
      setIsActive(true);
    }
    setPreviewResult(null);
    setError(null);
  }, [rule, open]);

  const updateCondition = (index: number, patch: Partial<RuleCondition>) => {
    setConditions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      // Reset operator si le champ change
      if (patch.field) {
        const ops = OPERATORS_FOR_FIELD[patch.field];
        updated[index].operator = ops[0] as any;
        updated[index].value = patch.field === "has_attachment" ? true : "";
      }
      return updated;
    });
    setPreviewResult(null);
  };

  const addCondition = () => setConditions((p) => [...p, defaultCondition()]);
  const removeCondition = (i: number) =>
    setConditions((p) => p.filter((_, idx) => idx !== i));

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const result = await rulesApi.preview(accountId, conditions);
      setPreviewResult(result);
    } catch {
      setError(t('common.error'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }

    const values = form.getFieldsValue();
    setSaving(true);
    setError(null);
    try {
      const dto = {
        name: values.name,
        description: values.description,
        conditions,
        action,
        schedule: schedule || null,
        is_active: isActive,
      };
      if (rule) {
        await rulesApi.update(accountId, rule.id, dto);
      } else {
        await rulesApi.create(accountId, dto);
      }
      onSaved();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const userLabels = labels.filter((l) => l.type === "user");

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={rule ? t('ruleForm.editTitle', { name: rule.name }) : t('ruleForm.createTitle')}
      width={680}
      footer={[
        <Button
          key="preview"
          icon={<EyeOutlined />}
          onClick={handlePreview}
          loading={previewing}
        >
          {t('ruleForm.preview')}
        </Button>,
        <Button key="cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} loading={saving}>
          {rule ? t('ruleForm.updateRule') : t('ruleForm.createRule')}
        </Button>,
      ]}
    >
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          style={{ marginBottom: 12 }}
        />
      )}

      {previewResult && (
        <Alert
          type="info"
          style={{ marginBottom: 12 }}
          message={
            <span>
              {t('ruleForm.previewQuery', { query: '' })}{" "}
              <Text code style={{ fontSize: 11 }}>
                {previewResult.query || "—"}
              </Text>
              <br />~
              <strong>
                {previewResult.estimatedCount.toLocaleString()}
              </strong>{" "}
              {t('ruleForm.previewCount', { count: '' }).replace('~ ', '')}
            </span>
          }
        />
      )}

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="name"
              label={t('ruleForm.ruleName')}
              rules={[{ required: true, message: t('common.error') }]}
            >
              <Input placeholder={t('ruleForm.ruleNamePlaceholder')} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('ruleForm.active')}>
              <Switch checked={isActive} onChange={setIsActive} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label={t('ruleForm.descriptionLabel')}>
          <Input.TextArea rows={1} placeholder={t('ruleForm.descriptionPlaceholder')} />
        </Form.Item>
      </Form>

      <Divider>
        {t('ruleForm.conditionsDivider')}{" "}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('ruleForm.conditionsHint')}
        </Text>
      </Divider>

      <Space orientation="vertical" style={{ width: "100%" }} size={8}>
        {conditions.map((cond, i) => (
          <Row key={i} gutter={8} align="middle">
            <Col span={7}>
              <Select
                size="small"
                style={{ width: "100%" }}
                value={cond.field}
                onChange={(v) => updateCondition(i, { field: v })}
                options={Object.entries(CONDITION_FIELD_LABELS).map(
                  ([k, _v]) => ({ value: k, label: t('ruleLabels.' + k) }),
                )}
              />
            </Col>
            <Col span={7}>
              <Select
                size="small"
                style={{ width: "100%" }}
                value={cond.operator}
                onChange={(v) => updateCondition(i, { operator: v })}
                options={OPERATORS_FOR_FIELD[cond.field].map((op) => ({
                  value: op,
                  label: t('ruleLabels.' + op),
                }))}
              />
            </Col>
            <Col span={8}>
              {cond.field === "has_attachment" ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('ruleLabels.is_true')}
                </Text>
              ) : cond.field === "size_gt" || cond.field === "size_lt" ? (
                <InputNumber
                  size="small"
                  style={{ width: "100%" }}
                  value={Number(cond.value)}
                  onChange={(v) => updateCondition(i, { value: v ?? 0 })}
                  addonAfter="octets"
                  min={0}
                />
              ) : (
                <Input
                  size="small"
                  value={String(cond.value)}
                  onChange={(e) =>
                    updateCondition(i, { value: e.target.value })
                  }
                  placeholder="Valeur…"
                />
              )}
            </Col>
            <Col span={2}>
              {conditions.length > 1 && (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => removeCondition(i)}
                />
              )}
            </Col>
          </Row>
        ))}

        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={addCondition}
        >
          {t('ruleForm.addCondition')}
        </Button>
      </Space>

      <Divider>{t('ruleForm.actionDivider')}</Divider>

      <Row gutter={16}>
        <Col span={12}>
          <Select
            style={{ width: "100%" }}
            value={action.type}
            onChange={(v) => setAction({ type: v })}
            options={Object.keys(ACTION_LABELS).map((k) => {
              const keyMap: Record<string, string> = {
                trash: 'trash', delete: 'permanentDelete', label: 'addLabel',
                unlabel: 'removeLabel', archive: 'archiveGmail', archive_nas: 'archiveNas',
                mark_read: 'markRead', mark_unread: 'markUnread',
              };
              return { value: k, label: t('ruleLabels.' + (keyMap[k] || k)) };
            })}
          />
        </Col>
        {ACTIONS_NEEDING_LABEL.includes(action.type) && (
          <Col span={12}>
            <Select
              style={{ width: "100%" }}
              placeholder={t('ruleForm.selectLabel')}
              value={action.labelId}
              onChange={(v) => setAction((a) => ({ ...a, labelId: v }))}
              options={userLabels.map((l) => ({ value: l.id, label: l.name }))}
            />
          </Col>
        )}
      </Row>

      <Divider>{t('ruleForm.scheduleDivider')}</Divider>

      <Select
        style={{ width: 220 }}
        value={schedule}
        onChange={setSchedule}
        options={SCHEDULE_OPTIONS.map((o) => {
          const schedKeyMap: Record<string, string> = {
            '': 'manualOnly', 'hourly': 'hourly', 'daily': 'daily',
            'weekly': 'weekly', 'monthly': 'monthly',
          };
          return { value: o.value, label: t('ruleLabels.' + (schedKeyMap[o.value ?? ''] || 'manualOnly')) };
        })}
      />
      <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
        {schedule
          ? t('ruleForm.scheduleAuto', { schedule })
          : t('ruleForm.scheduleManual')}
      </Text>
    </Modal>
  );
}
