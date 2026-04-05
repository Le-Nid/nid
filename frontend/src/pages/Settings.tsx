import { useEffect, useState } from 'react'
import { Card, Button, Avatar, Tag, Popconfirm, Typography, Alert, Space, Divider, Progress, Descriptions, Table, Input, App, Modal, Form, Select, Switch } from 'antd'
import { Globe, Trash2, Plus, CheckCircle, User, History, Lock, ShieldCheck, Webhook, Download, Upload, Bell, CloudCog, Settings as SettingsIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'
import { formatBytes } from '../utils/format'
import { twoFactorApi, webhooksApi, configApi, notificationsApi, archiveApi } from '../api'
import { useAuditLogs, useWebhooks, useNotificationPreferences } from '../hooks/queries'
import { useQueryClient } from '@tanstack/react-query'
import JobProgressModal from '../components/JobProgressModal'

const { Title, Text } = Typography

export default function SettingsPage() {
  const { t } = useTranslation()
  const { message, notification } = App.useApp()
  const { user, gmailAccounts, fetchMe, storageUsedBytes } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [connecting, setConnecting] = useState(false)
  const [auditPage, setAuditPage] = useState(1)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)
  const [webhookModal, setWebhookModal] = useState(false)
  const [webhookForm] = Form.useForm()
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false)
  const [archivingAccount, setArchivingAccount] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: auditData, isLoading: auditLoading } = useAuditLogs({ page: auditPage, limit: 10 })
  const auditLogs = auditData?.data ?? []
  const auditTotal = auditData?.total ?? 0

  const { data: webhooks = [] } = useWebhooks()
  const { data: notifPrefs = {
    weekly_report: true,
    job_completed: true,
    job_failed: true,
    rule_executed: false,
    quota_warning: true,
    integrity_alert: true,
    weekly_report_toast: false,
    job_completed_toast: true,
    job_failed_toast: true,
    rule_executed_toast: false,
    quota_warning_toast: false,
    integrity_alert_toast: false,
  } } = useNotificationPreferences()

  const gmailStatus = searchParams.get('gmail')
  const connectedEmail = searchParams.get('account')

  const updateNotifPref = async (key: string, value: boolean) => {
    setNotifPrefsLoading(true)
    try {
      await notificationsApi.updatePreferences({ [key]: value })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] })
    } catch {
      message.error(t('common.error'))
    } finally {
      setNotifPrefsLoading(false)
    }
  }

  const fetchWebhooks = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] })

  // Restore session after Gmail connect redirect
  useEffect(() => {
    if (gmailStatus === 'connected') fetchMe()
  }, [gmailStatus])

  const handleExport = async () => {
    try {
      const data = await configApi.exportConfig()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nid-config-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      message.success(t('settings.exportBtn'))
    } catch { message.error(t('common.error')) }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const data = JSON.parse(text)
        await configApi.importConfig(data)
        message.success(t('settings.importBtn'))
        fetchMe()
      } catch { message.error(t('common.error')) }
    }
    input.click()
  }

  const connectGmail = async () => {
    setConnecting(true)
    try {
      const { data } = await api.get('/api/auth/gmail/connect')
      globalThis.location.href = data.url
    } catch (e: unknown) {
      if (e instanceof Error && 'response' in e) {
        const axiosErr = e as { response?: { status?: number; data?: { error?: string } } }
        if (axiosErr.response?.status === 403) {
          alert(axiosErr.response?.data?.error ?? t('settings.gmailLimitReached'))
        }
      }
    } finally {
      setConnecting(false)
    }
  }

  const disconnectAccount = async (accountId: string) => {
    await api.delete(`/api/auth/gmail/${accountId}`)
    fetchMe()
  }

  const forceArchive = async (accountId: string) => {
    setArchivingAccount(accountId)
    try {
      const { jobId } = await archiveApi.triggerArchive(accountId, { differential: true })
      setActiveJobId(jobId)
      notification.success({
        message: t('settings.archiveStarted'),
        description: t('settings.archiveStartedDesc'),
      })
    } catch {
      message.error(t('common.error'))
    } finally {
      setArchivingAccount(null)
    }
  }

  const quotaBytes = user?.storage_quota_bytes ?? 5_368_709_120
  const quotaPercent = quotaBytes > 0 ? Math.round((storageUsedBytes / quotaBytes) * 100) : 0

  return (
    <div style={{ maxWidth: 720 }}>
      <Title level={3}><SettingsIcon size={20} style={{ marginRight: 8 }} />{t('settings.title')}</Title>

      {gmailStatus === 'connected' && (
        <Alert
          type="success"
          message={t('settings.gmailConnected', { email: connectedEmail })}
          icon={<CheckCircle size={14} />}
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}
      {gmailStatus === 'error' && (
        <Alert
          type="error"
          message={t('settings.gmailConnectError')}
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Profil utilisateur */}
      <Card title={t('settings.profile')} style={{ marginBottom: 24 }}>
        <Space size="large" align="start">
          {user?.avatar_url
            ? <Avatar src={user.avatar_url} size={64} crossOrigin="anonymous" />
            : <Avatar icon={<User size={14} />} size={64} />
          }
          <Descriptions column={1} size="small">
            <Descriptions.Item label={t('settings.email')}>{user?.email}</Descriptions.Item>
            {user?.display_name && (
              <Descriptions.Item label={t('settings.name')}>{user.display_name}</Descriptions.Item>
            )}
            <Descriptions.Item label={t('settings.role')}>
              <Tag color={user?.role === 'admin' ? 'red' : 'blue'}>{user?.role}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Space>

        <Divider />

        <div>
          <Text strong>{t('settings.archiveStorage')}</Text>
          <div style={{ marginTop: 8 }}>
            <Progress
              percent={quotaPercent}
              format={() => `${formatBytes(storageUsedBytes)} / ${formatBytes(quotaBytes)}`}
              status={quotaPercent > 90 ? 'exception' : 'normal'}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Text strong>{t('settings.gmailAccountsCount')}</Text>
          <Text type="secondary" style={{ marginLeft: 8 }}>
            {t('settings.gmailAccountsQuota', { count: gmailAccounts.length, max: user?.max_gmail_accounts ?? 3 })}
          </Text>
        </div>
      </Card>

      <Card title={t('settings.gmailAccounts')}>
        {gmailAccounts.length === 0 ? (
          <Typography.Text type="secondary">{t('settings.noGmailAccount')}</Typography.Text>
        ) : (
          gmailAccounts.map((account) => (
            <div key={account.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ant-color-split, #f0f0f0)' }}>
              <Space>
                <Avatar icon={<Globe size={14} />} style={{ backgroundColor: '#4285F4' }} />
                <span>{account.email}</span>
                {account.is_active && <Tag color="success">{t('common.active')}</Tag>}
              </Space>
              <Space>
                <Button
                  icon={<CloudCog size={14} />}
                  size="small"
                  loading={archivingAccount === account.id}
                  onClick={() => forceArchive(account.id)}
                >
                  {t('settings.forceArchive')}
                </Button>
                <Popconfirm
                  title={t('settings.disconnectConfirm')}
                  description={t('settings.disconnectHint')}
                  onConfirm={() => disconnectAccount(account.id)}
                  okText={t('settings.disconnect')}
                  cancelText={t('common.cancel')}
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<Trash2 size={14} />} size="small">
                    {t('settings.disconnect')}
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          ))
        )}

        <Divider />

        <Button
          type="primary"
          icon={<Plus size={14} />}
          onClick={connectGmail}
          loading={connecting}
        >
          {t('settings.connectGmail')}
        </Button>

        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('settings.scopeHint')}
          </Text>
        </div>
      </Card>

      {/* 2FA / TOTP */}
      <Card title={<><ShieldCheck size={14} /> {t('settings.twoFactor')}</>} style={{ marginTop: 24 }}>
        {(user as any)?.totp_enabled ? (
          <>
            <Alert type="success" title={t('settings.twoFactorEnabled')} showIcon style={{ marginBottom: 16 }} />
            <Space>
              <Input
                placeholder={t('settings.totpCode')}
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                style={{ width: 140 }}
              />
              <Popconfirm
                title={t('settings.disableTwoFactor') + ' ?'}
                description={t('settings.disableTwoFactorHint')}
                onConfirm={async () => {
                  if (totpCode.length !== 6) return
                  setTotpLoading(true)
                  try {
                    await twoFactorApi.disable(totpCode)
                    message.success(t('settings.twoFactorDisabled'))
                    setTotpCode('')
                    setTotpSetup(null)
                    fetchMe()
                  } catch (e: unknown) {
                    const msg = e instanceof Error && 'response' in e ? (e as any).response?.data?.error : undefined
                    message.error(msg || t('common.error'))
                  } finally {
                    setTotpLoading(false)
                  }
                }}
                okText={t('common.deactivate')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<Lock size={14} />} loading={totpLoading}>
                  {t('settings.disableTwoFactor')}
                </Button>
              </Popconfirm>
            </Space>
          </>
        ) : totpSetup ? (
          <>
            <Text>{t('settings.twoFactorQrHint')}</Text>
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <img src={totpSetup.qrDataUrl} alt="QR Code TOTP" style={{ maxWidth: 200 }} />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('settings.manualKey')} <code>{totpSetup.secret}</code>
            </Text>
            <Divider />
            <Space>
              <Input
                placeholder={t('settings.sixDigitCode')}
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                style={{ width: 160 }}
              />
              <Button
                type="primary"
                icon={<Lock size={14} />}
                loading={totpLoading}
                disabled={totpCode.length !== 6}
                onClick={async () => {
                  setTotpLoading(true)
                  try {
                    await twoFactorApi.enable(totpCode)
                    message.success(t('settings.twoFactorSuccess'))
                    setTotpSetup(null)
                    setTotpCode('')
                    fetchMe()
                  } catch (e: unknown) {
                    const msg = e instanceof Error && 'response' in e ? (e as any).response?.data?.error : undefined
                    message.error(msg || t('settings.invalidCode'))
                  } finally {
                    setTotpLoading(false)
                  }
                }}
              >
                {t('settings.verifyAndActivate')}
              </Button>
              <Button onClick={() => { setTotpSetup(null); setTotpCode('') }}>{t('common.cancel')}</Button>
            </Space>
          </>
        ) : (
          <>
            <Text>{t('settings.twoFactorSetupHint')}</Text>
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                icon={<ShieldCheck size={14} />}
                loading={totpLoading}
                onClick={async () => {
                  setTotpLoading(true)
                  try {
                    const data = await twoFactorApi.setup()
                    setTotpSetup(data)
                  } catch (e: unknown) {
                    const msg = e instanceof Error && 'response' in e ? (e as any).response?.data?.error : undefined
                    message.error(msg || t('common.error'))
                  } finally {
                    setTotpLoading(false)
                  }
                }}
              >
                {t('settings.setupTwoFactor')}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Notification Preferences */}
      <Card title={<><Bell size={14} /> {t('settings.notificationPrefs')}</>} style={{ marginTop: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {t('settings.notificationPrefsHint')}
        </Text>
        <Table
          dataSource={[
            { key: 'weekly_report', label: t('settings.weeklyReport'), desc: t('settings.weeklyReportDesc'), webhookEvent: null },
            { key: 'job_completed', label: t('settings.jobCompleted'), desc: t('settings.jobCompletedDesc'), webhookEvent: 'job.completed' },
            { key: 'job_failed', label: t('settings.jobFailed'), desc: t('settings.jobFailedDesc'), webhookEvent: 'job.failed' },
            { key: 'rule_executed', label: t('settings.ruleExecuted'), desc: t('settings.ruleExecutedDesc'), webhookEvent: 'rule.executed' },
            { key: 'quota_warning', label: t('settings.quotaWarning'), desc: t('settings.quotaWarningDesc'), webhookEvent: 'quota.warning' },
            { key: 'integrity_alert', label: t('settings.integrityAlert'), desc: t('settings.integrityAlertDesc'), webhookEvent: 'integrity.failed' },
          ]}
          pagination={false}
          size="small"
          columns={[
            {
              title: t('settings.notification'),
              dataIndex: 'label',
              render: (_: any, row: any) => (
                <div>
                  <Text strong>{row.label}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{row.desc}</Text>
                </div>
              ),
            },
            {
              title: t('settings.inApp'),
              width: 90,
              align: 'center' as const,
              render: (_: any, row: any) => (
                <Switch
                  size="small"
                  checked={notifPrefs[row.key]}
                  loading={notifPrefsLoading}
                  onChange={(v) => updateNotifPref(row.key, v)}
                />
              ),
            },
            {
              title: t('settings.toast'),
              width: 90,
              align: 'center' as const,
              render: (_: any, row: any) => (
                <Switch
                  size="small"
                  checked={notifPrefs[`${row.key}_toast`]}
                  loading={notifPrefsLoading}
                  onChange={(v) => updateNotifPref(`${row.key}_toast`, v)}
                />
              ),
            },
            {
              title: t('settings.webhook'),
              width: 100,
              align: 'center' as const,
              render: (_: any, row: any) => {
                if (!row.webhookEvent) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
                const count = webhooks.filter((w: any) => w.is_active && w.events.includes(row.webhookEvent)).length
                return count > 0
                  ? <Tag color="green">{count} actif{count > 1 ? 's' : ''}</Tag>
                  : <Text type="secondary" style={{ fontSize: 11 }}>aucun</Text>
              },
            },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
          {t('settings.channelHint')}
        </Text>
      </Card>

      {/* Webhooks */}
      <Card title={<><Webhook size={14} /> {t('settings.webhooks')}</>} style={{ marginTop: 24 }}>
        {webhooks.length === 0 ? (
          <Typography.Text type="secondary">{t('settings.noWebhook')}</Typography.Text>
        ) : (
          webhooks.map((wh: any) => (
            <div key={wh.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ant-color-split, #f0f0f0)' }}>
              <div>
                <Space>{wh.name} <Tag>{wh.type}</Tag> {wh.last_status && <Tag color={wh.last_status < 300 ? 'green' : 'red'}>{wh.last_status}</Tag>}</Space>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{wh.events.join(', ')}</Text></div>
              </div>
              <Space>
                <Switch size="small" checked={wh.is_active} onChange={() => webhooksApi.toggle(wh.id).then(fetchWebhooks)} />
                <Button size="small" onClick={async () => { await webhooksApi.test(wh.id); message.success(t('settings.testSent')) }}>{t('common.test')}</Button>
                <Popconfirm title={t('settings.deleteWebhookConfirm')} onConfirm={() => webhooksApi.remove(wh.id).then(fetchWebhooks)}>
                  <Button danger size="small" icon={<Trash2 size={14} />} />
                </Popconfirm>
              </Space>
            </div>
          ))
        )}
        <Divider />
        <Button icon={<Plus size={14} />} onClick={() => { webhookForm.resetFields(); setWebhookModal(true) }}>
          {t('settings.newWebhook')}
        </Button>
        <Modal
          title={t('settings.newWebhook')}
          open={webhookModal}
          onCancel={() => setWebhookModal(false)}
          forceRender
          onOk={() => webhookForm.validateFields().then(async (vals) => {
            await webhooksApi.create(vals)
            setWebhookModal(false)
            fetchWebhooks()
            message.success(t('settings.webhookCreated'))
          })}
        >
          <Form form={webhookForm} layout="vertical">
            <Form.Item name="name" label={t('settings.webhookName')} rules={[{ required: true }]}>
              <Input placeholder="Mon webhook Discord" />
            </Form.Item>
            <Form.Item name="url" label={t('settings.webhookUrl')} rules={[{ required: true, type: 'url' }]}>
              <Input placeholder="https://discord.com/api/webhooks/..." />
            </Form.Item>
            <Form.Item name="type" label={t('settings.webhookType')} initialValue="generic">
              <Select options={[
                { value: 'generic', label: 'Générique (HMAC)' },
                { value: 'discord', label: 'Discord' },
                { value: 'slack', label: 'Slack' },
                { value: 'ntfy', label: 'Ntfy' },
              ]} />
            </Form.Item>
            <Form.Item noStyle dependencies={['type']}>
              {() => webhookForm.getFieldValue('type') === 'ntfy' && (
                <>
                  <Form.Item name="auth_user" label={t('settings.ntfyUser')}>
                    <Input placeholder={t('settings.ntfyUserPlaceholder')} autoComplete="off" />
                  </Form.Item>
                  <Form.Item name="auth_password" label={t('settings.ntfyPassword')}>
                    <Input.Password placeholder={t('settings.ntfyPasswordPlaceholder')} autoComplete="new-password" />
                  </Form.Item>
                </>
              )}
            </Form.Item>
            <Form.Item name="events" label={t('settings.webhookEvents')} rules={[{ required: true }]}>
              <Select mode="multiple" placeholder={t('settings.webhookSelectEvents')} options={[
                { value: 'job.completed', label: t('settings.jobCompleted') },
                { value: 'job.failed', label: t('settings.jobFailed') },
                { value: 'rule.executed', label: t('settings.ruleExecuted') },
                { value: 'quota.warning', label: t('settings.quotaWarning') },
                { value: 'integrity.failed', label: t('settings.integrityAlert') },
              ]} />
            </Form.Item>
          </Form>
        </Modal>
      </Card>

      {/* Export / Import */}
      <Card title={t('settings.exportConfig')} style={{ marginTop: 24 }}>
        <Text>{t('settings.exportHint')}</Text>
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button icon={<Download size={14} />} onClick={handleExport}>{t('settings.exportBtn')}</Button>
            <Button icon={<Upload size={14} />} onClick={handleImport}>{t('settings.importBtn')}</Button>
          </Space>
        </div>
      </Card>

      {/* Audit log */}
      <Card title={<><History size={14} /> {t('settings.auditLog')}</>} style={{ marginTop: 24 }}>
        <Table
          dataSource={auditLogs}
          rowKey="id"
          loading={auditLoading}
          size="small"
          pagination={{
            current: auditPage,
            total: auditTotal,
            pageSize: 10,
            onChange: (p) => setAuditPage(p),
            showSizeChanger: false,
          }}
          columns={[
            {
              title: t('settings.auditDate'),
              dataIndex: 'created_at',
              width: 170,
              render: (v: string) => new Date(v).toLocaleString('fr-FR'),
            },
            {
              title: t('settings.auditAction'),
              dataIndex: 'action',
              width: 180,
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: t('settings.auditTarget'),
              dataIndex: 'target_type',
              width: 120,
              render: (v: string, row: any) => v ? `${v} ${row.target_id ? '#' + row.target_id.slice(0, 8) : ''}` : '—',
            },
            {
              title: t('settings.auditDetails'),
              dataIndex: 'details',
              render: (v: any) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{JSON.stringify(v)}</Text> : '—',
            },
          ]}
        />
      </Card>

      {activeJobId && (
        <JobProgressModal jobId={activeJobId} onClose={() => setActiveJobId(null)} />
      )}
    </div>
  )
}
