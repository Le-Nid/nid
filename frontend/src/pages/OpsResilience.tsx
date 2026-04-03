import { useState } from 'react'
import {
  Card, Tabs, Typography, Form, Input, InputNumber, Select, Switch,
  Button, Table, Space, Popconfirm, Progress, Statistic, Row, Col,
  Upload, Divider, Tag, Alert, App,
} from 'antd'
import {
  CloudServerOutlined, DeleteOutlined, PlusOutlined,
  DashboardOutlined, ImportOutlined, ExportOutlined,
  UploadOutlined, PlayCircleOutlined,
  ApiOutlined, SafetyOutlined, DatabaseOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import {
  useStorageConfig, useSaveStorageConfig, useTestS3,
  useRetentionPolicies, useCreateRetentionPolicy, useUpdateRetentionPolicy,
  useDeleteRetentionPolicy, useRunRetention,
  useQuotaStats,
  useImportMbox, useImportImap, useExportMbox,
} from '../hooks/queries'
import dayjs from 'dayjs'

const { Title, Text, Paragraph } = Typography

export default function OpsResilience() {
  const { t } = useTranslation()
  const { activeAccountId } = useAuthStore()

  return (
    <div>
      <Title level={3}>{t('ops.title')}</Title>
      <Paragraph type="secondary">{t('ops.description')}</Paragraph>

      <Tabs
        defaultActiveKey="storage"
        items={[
          {
            key: 'storage',
            label: <span><CloudServerOutlined /> {t('ops.tabs.storage')}</span>,
            children: <StorageTab />,
          },
          {
            key: 'retention',
            label: <span><DeleteOutlined /> {t('ops.tabs.retention')}</span>,
            children: <RetentionTab />,
          },
          {
            key: 'quota',
            label: <span><DashboardOutlined /> {t('ops.tabs.quota')}</span>,
            children: activeAccountId ? <QuotaTab accountId={activeAccountId} /> : <Alert message={t('ops.selectAccount')} type="info" />,
          },
          {
            key: 'import',
            label: <span><ImportOutlined /> {t('ops.tabs.import')}</span>,
            children: activeAccountId ? <ImportExportTab accountId={activeAccountId} /> : <Alert message={t('ops.selectAccount')} type="info" />,
          },
        ]}
      />
    </div>
  )
}

// ─── Storage Tab ────────────────────────────────────────────

function StorageTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const { data: cfg, isLoading } = useStorageConfig()
  const saveConfig = useSaveStorageConfig()
  const testS3 = useTestS3()
  const [storageType, setStorageType] = useState<'local' | 's3'>('local')

  const onLoad = () => {
    if (cfg) {
      setStorageType(cfg.type ?? 'local')
      form.setFieldsValue({
        type: cfg.type ?? 'local',
        s3Endpoint: cfg.s3_endpoint,
        s3Region: cfg.s3_region,
        s3Bucket: cfg.s3_bucket,
        s3ForcePathStyle: cfg.s3_force_path_style ?? true,
      })
    }
  }

  if (cfg && !form.isFieldsTouched()) onLoad()

  const handleSave = async (values: any) => {
    try {
      await saveConfig.mutateAsync(values)
      message.success(t('ops.storage.saved'))
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleTest = async () => {
    const values = form.getFieldsValue()
    try {
      const result = await testS3.mutateAsync({
        endpoint: values.s3Endpoint,
        region: values.s3Region,
        bucket: values.s3Bucket,
        accessKeyId: values.s3AccessKeyId,
        secretAccessKey: values.s3SecretAccessKey,
        forcePathStyle: values.s3ForcePathStyle,
      })
      if (result.success) {
        message.success(t('ops.storage.testSuccess'))
      } else {
        message.error(`${t('ops.storage.testFailed')}: ${result.error}`)
      }
    } catch {
      message.error(t('ops.storage.testFailed'))
    }
  }

  return (
    <Card loading={isLoading}>
      <Alert
        message={t('ops.storage.info')}
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{ type: 'local', s3ForcePathStyle: true, s3Region: 'us-east-1', s3Bucket: 'nid-archives' }}
      >
        <Form.Item name="type" label={t('ops.storage.type')}>
          <Select onChange={(v) => setStorageType(v)}>
            <Select.Option value="local">
              <DatabaseOutlined /> {t('ops.storage.local')}
            </Select.Option>
            <Select.Option value="s3">
              <CloudServerOutlined /> {t('ops.storage.s3')}
            </Select.Option>
          </Select>
        </Form.Item>

        {storageType === 's3' && (
          <>
            <Form.Item name="s3Endpoint" label={t('ops.storage.endpoint')} rules={[{ required: true }]}>
              <Input placeholder="https://s3.amazonaws.com ou https://minio.local:9000" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="s3Region" label={t('ops.storage.region')}>
                  <Input placeholder="us-east-1" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="s3Bucket" label={t('ops.storage.bucket')}>
                  <Input placeholder="nid-archives" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="s3AccessKeyId" label={t('ops.storage.accessKey')} rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="s3SecretAccessKey" label={t('ops.storage.secretKey')} rules={[{ required: true }]}>
                  <Input.Password />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="s3ForcePathStyle" label={t('ops.storage.pathStyle')} valuePropName="checked">
              <Switch />
            </Form.Item>

            <Button
              icon={<SafetyOutlined />}
              onClick={handleTest}
              loading={testS3.isPending}
              style={{ marginBottom: 16 }}
            >
              {t('ops.storage.test')}
            </Button>
          </>
        )}

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saveConfig.isPending}>
            {t('common.save')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

// ─── Retention Tab ──────────────────────────────────────────

function RetentionTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { gmailAccounts } = useAuthStore()
  const { data: policies, isLoading } = useRetentionPolicies()
  const createPolicy = useCreateRetentionPolicy()
  const updatePolicy = useUpdateRetentionPolicy()
  const deletePolicy = useDeleteRetentionPolicy()
  const runRetention = useRunRetention()
  const [showForm, setShowForm] = useState(false)
  const [form] = Form.useForm()

  const handleCreate = async (values: any) => {
    try {
      await createPolicy.mutateAsync({
        name: values.name,
        gmailAccountId: values.gmailAccountId || undefined,
        label: values.label || undefined,
        maxAgeDays: values.maxAgeDays,
      })
      message.success(t('ops.retention.created'))
      form.resetFields()
      setShowForm(false)
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await updatePolicy.mutateAsync({ id, isActive })
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleRun = async () => {
    try {
      const result = await runRetention.mutateAsync()
      message.success(t('ops.retention.runResult', { policies: result.policiesRun, deleted: result.totalDeleted }))
    } catch {
      message.error(t('common.error'))
    }
  }

  const columns = [
    { title: t('ops.retention.name'), dataIndex: 'name', key: 'name' },
    {
      title: t('ops.retention.account'),
      dataIndex: 'gmail_account_id',
      key: 'account',
      render: (id: string | null) => {
        if (!id) return <Tag>{t('ops.retention.allAccounts')}</Tag>
        const acc = gmailAccounts.find((a) => a.id === id)
        return acc?.email ?? id
      },
    },
    { title: t('ops.retention.label'), dataIndex: 'label', key: 'label', render: (l: string | null) => l ?? '—' },
    {
      title: t('ops.retention.maxAge'),
      dataIndex: 'max_age_days',
      key: 'maxAge',
      render: (d: number) => {
        if (d >= 365) return `${Math.floor(d / 365)} ${t('ops.retention.years')}`
        if (d >= 30) return `${Math.floor(d / 30)} ${t('ops.retention.months')}`
        return `${d} ${t('ops.retention.days')}`
      },
    },
    {
      title: t('ops.retention.deleted'),
      dataIndex: 'deleted_count',
      key: 'deleted',
    },
    {
      title: t('ops.retention.lastRun'),
      dataIndex: 'last_run_at',
      key: 'lastRun',
      render: (d: string | null) => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—',
    },
    {
      title: t('common.active'),
      dataIndex: 'is_active',
      key: 'active',
      render: (v: boolean, rec: any) => (
        <Switch checked={v} onChange={(c) => handleToggle(rec.id, c)} />
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: any, rec: any) => (
        <Popconfirm title={t('ops.retention.deleteConfirm')} onConfirm={() => deletePolicy.mutate(rec.id)}>
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Card loading={isLoading}>
      <Alert
        message={t('ops.retention.info')}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Space style={{ marginBottom: 16 }}>
        <Button icon={<PlusOutlined />} type="primary" onClick={() => setShowForm(!showForm)}>
          {t('ops.retention.add')}
        </Button>
        <Button icon={<PlayCircleOutlined />} onClick={handleRun} loading={runRetention.isPending}>
          {t('ops.retention.runNow')}
        </Button>
      </Space>

      {showForm && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Form form={form} layout="inline" onFinish={handleCreate} style={{ flexWrap: 'wrap', gap: 8 }}>
            <Form.Item name="name" rules={[{ required: true }]}>
              <Input placeholder={t('ops.retention.name')} />
            </Form.Item>
            <Form.Item name="gmailAccountId">
              <Select placeholder={t('ops.retention.account')} allowClear style={{ minWidth: 200 }}>
                {gmailAccounts.map((a) => (
                  <Select.Option key={a.id} value={a.id}>{a.email}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="label">
              <Input placeholder={t('ops.retention.labelPlaceholder')} />
            </Form.Item>
            <Form.Item name="maxAgeDays" rules={[{ required: true }]}>
              <InputNumber min={1} placeholder={t('ops.retention.maxAgeDays')} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={createPolicy.isPending}>
                {t('common.create')}
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      <Table
        dataSource={policies ?? []}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
      />
    </Card>
  )
}

// ─── Quota Tab ──────────────────────────────────────────────

function QuotaTab({ accountId }: { accountId: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuotaStats(accountId)

  if (isLoading || !data) return <Card loading />

  const usagePercent = data.usage.lastMinute.percentOfLimit

  return (
    <Card>
      <Alert
        message={t('ops.quota.info')}
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[24, 24]}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('ops.quota.lastMinute')}
              value={data.usage.lastMinute.units}
              suffix={`/ ${data.limits.perMinute}`}
            />
            <Progress
              percent={usagePercent}
              status={usagePercent > 80 ? 'exception' : usagePercent > 50 ? 'active' : 'success'}
              size="small"
              style={{ marginTop: 8 }}
            />
            <Text type="secondary">{data.usage.lastMinute.calls} {t('ops.quota.calls')}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('ops.quota.lastHour')}
              value={data.usage.lastHour.units}
              suffix={t('ops.quota.units')}
            />
            <Text type="secondary">{data.usage.lastHour.calls} {t('ops.quota.calls')}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('ops.quota.last24h')}
              value={data.usage.last24h.units}
              suffix={t('ops.quota.units')}
            />
            <Text type="secondary">{data.usage.last24h.calls} {t('ops.quota.calls')}</Text>
          </Card>
        </Col>
      </Row>

      <Divider>{t('ops.quota.topEndpoints')}</Divider>

      <Table
        dataSource={data.topEndpoints}
        columns={[
          { title: t('ops.quota.endpoint'), dataIndex: 'endpoint', key: 'endpoint' },
          { title: t('ops.quota.units'), dataIndex: 'units', key: 'units' },
          { title: t('ops.quota.calls'), dataIndex: 'calls', key: 'calls' },
        ]}
        rowKey="endpoint"
        pagination={false}
        size="small"
      />

      <Divider>{t('ops.quota.hourlyBreakdown')}</Divider>

      <Table
        dataSource={data.hourlyBreakdown}
        columns={[
          {
            title: t('ops.quota.hour'),
            dataIndex: 'hour',
            key: 'hour',
            render: (h: string) => dayjs(h).format('HH:mm'),
          },
          { title: t('ops.quota.units'), dataIndex: 'units', key: 'units' },
          { title: t('ops.quota.calls'), dataIndex: 'calls', key: 'calls' },
        ]}
        rowKey="hour"
        pagination={false}
        size="small"
      />
    </Card>
  )
}

// ─── Import/Export Tab ──────────────────────────────────────

function ImportExportTab({ accountId }: { accountId: string }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const importMbox = useImportMbox(accountId)
  const importImap = useImportImap(accountId)
  const exportMbox = useExportMbox(accountId)
  const [imapForm] = Form.useForm()

  const handleMboxUpload = async (file: File) => {
    try {
      const result = await importMbox.mutateAsync(file)
      message.success(t('ops.import.mboxStarted', { jobId: result.jobId }))
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleImapImport = async (values: any) => {
    try {
      const result = await importImap.mutateAsync({
        host: values.host,
        port: values.port ?? 993,
        secure: values.secure ?? true,
        user: values.user,
        pass: values.pass,
        folder: values.folder || undefined,
        maxMessages: values.maxMessages || undefined,
      })
      message.success(t('ops.import.imapStarted', { jobId: result.jobId }))
    } catch {
      message.error(t('common.error'))
    }
  }

  const handleExportMbox = async () => {
    try {
      const blob = await exportMbox.mutateAsync(undefined)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `archive-export-${new Date().toISOString().slice(0, 10)}.mbox`
      a.click()
      URL.revokeObjectURL(url)
      message.success(t('ops.import.exportSuccess'))
    } catch {
      message.error(t('common.error'))
    }
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={12}>
        <Card title={<><UploadOutlined /> {t('ops.import.mboxTitle')}</>} size="small">
          <Alert
            message={t('ops.import.mboxInfo')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Upload.Dragger
            accept=".mbox,.mbx"
            maxCount={1}
            beforeUpload={(file) => {
              handleMboxUpload(file)
              return false
            }}
            showUploadList={false}
          >
            <p><UploadOutlined style={{ fontSize: 32 }} /></p>
            <p>{t('ops.import.dropMbox')}</p>
          </Upload.Dragger>
          {importMbox.isPending && <Progress percent={50} status="active" style={{ marginTop: 8 }} />}
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title={<><ApiOutlined /> {t('ops.import.imapTitle')}</>} size="small">
          <Alert
            message={t('ops.import.imapInfo')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form form={imapForm} layout="vertical" onFinish={handleImapImport} size="small">
            <Row gutter={8}>
              <Col span={16}>
                <Form.Item name="host" label={t('ops.import.imapHost')} rules={[{ required: true }]}>
                  <Input placeholder="imap.outlook.com" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="port" label={t('ops.import.imapPort')} initialValue={993}>
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item name="user" label={t('ops.import.imapUser')} rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="pass" label={t('ops.import.imapPass')} rules={[{ required: true }]}>
                  <Input.Password />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item name="folder" label={t('ops.import.imapFolder')}>
                  <Input placeholder="INBOX" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="maxMessages" label={t('ops.import.maxMessages')}>
                  <InputNumber style={{ width: '100%' }} min={1} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="secure" label={t('ops.import.imapSecure')} valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={importImap.isPending} icon={<ImportOutlined />}>
              {t('ops.import.startImport')}
            </Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24}>
        <Card title={<><ExportOutlined /> {t('ops.import.exportTitle')}</>} size="small">
          <Paragraph type="secondary">{t('ops.import.exportInfo')}</Paragraph>
          <Button
            icon={<ExportOutlined />}
            onClick={handleExportMbox}
            loading={exportMbox.isPending}
          >
            {t('ops.import.exportMbox')}
          </Button>
        </Card>
      </Col>
    </Row>
  )
}
