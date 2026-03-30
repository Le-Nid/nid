import { useEffect, useState } from 'react'
import { Card, Button, List, Avatar, Tag, Popconfirm, Typography, Alert, Space, Divider, Progress, Descriptions, Table, Input, message, Modal, Form, Select, Switch } from 'antd'
import { GoogleOutlined, DeleteOutlined, PlusOutlined, CheckCircleOutlined, UserOutlined, HistoryOutlined, LockOutlined, SafetyOutlined, ApiOutlined, DownloadOutlined, UploadOutlined, BellOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'
import { formatBytes } from '../utils/format'
import { auditApi, twoFactorApi, webhooksApi, configApi, notificationsApi } from '../api'

const { Title, Text } = Typography

export default function SettingsPage() {
  const { user, gmailAccounts, fetchMe, storageUsedBytes } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [connecting, setConnecting] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditPage, setAuditPage] = useState(1)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [webhookModal, setWebhookModal] = useState(false)
  const [webhookForm] = Form.useForm()
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
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
  })
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false)

  const gmailStatus = searchParams.get('gmail')
  const connectedEmail = searchParams.get('account')

  useEffect(() => {
    if (gmailStatus === 'connected') fetchMe()
  }, [gmailStatus])

  const fetchAuditLogs = async (page = 1) => {
    setAuditLoading(true)
    try {
      const data = await auditApi.list({ page, limit: 10 })
      setAuditLogs(data.data)
      setAuditTotal(data.total)
      setAuditPage(page)
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => { fetchAuditLogs(); fetchWebhooks(); fetchNotifPrefs() }, [])

  const fetchWebhooks = async () => {
    try { setWebhooks(await webhooksApi.list()) } catch { /* ignore */ }
  }

  const fetchNotifPrefs = async () => {
    try {
      const prefs = await notificationsApi.getPreferences()
      setNotifPrefs(prefs)
    } catch { /* ignore */ }
  }

  const updateNotifPref = async (key: string, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value }
    setNotifPrefs(updated)
    setNotifPrefsLoading(true)
    try {
      await notificationsApi.updatePreferences({ [key]: value })
    } catch {
      // Revert on error
      setNotifPrefs(notifPrefs)
      message.error('Erreur de sauvegarde')
    } finally {
      setNotifPrefsLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const data = await configApi.exportConfig()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gmail-manager-config-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      message.success('Configuration exportée')
    } catch { message.error('Erreur export') }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const data = JSON.parse(text)
        await configApi.importConfig(data)
        message.success('Configuration importée')
        fetchMe()
      } catch { message.error('Fichier invalide') }
    }
    input.click()
  }

  const connectGmail = async () => {
    setConnecting(true)
    try {
      const { data } = await api.get('/api/auth/gmail/connect')
      globalThis.location.href = data.url
    } catch (e: any) {
      if (e.response?.status === 403) {
        alert(e.response?.data?.error ?? 'Limite de comptes Gmail atteinte')
      }
    } finally {
      setConnecting(false)
    }
  }

  const disconnectAccount = async (accountId: string) => {
    await api.delete(`/api/auth/gmail/${accountId}`)
    fetchMe()
  }

  const quotaBytes = user?.storage_quota_bytes ?? 5_368_709_120
  const quotaPercent = quotaBytes > 0 ? Math.round((storageUsedBytes / quotaBytes) * 100) : 0

  return (
    <div style={{ maxWidth: 720 }}>
      <Title level={3}>⚙️ Paramètres</Title>

      {gmailStatus === 'connected' && (
        <Alert
          type="success"
          message={`Compte Gmail connecté : ${connectedEmail}`}
          icon={<CheckCircleOutlined />}
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}
      {gmailStatus === 'error' && (
        <Alert
          type="error"
          message="Erreur lors de la connexion Gmail. Réessayez."
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Profil utilisateur */}
      <Card title="Profil" style={{ marginBottom: 24 }}>
        <Space size="large" align="start">
          {user?.avatar_url
            ? <Avatar src={user.avatar_url} size={64} />
            : <Avatar icon={<UserOutlined />} size={64} />
          }
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Email">{user?.email}</Descriptions.Item>
            {user?.display_name && (
              <Descriptions.Item label="Nom">{user.display_name}</Descriptions.Item>
            )}
            <Descriptions.Item label="Rôle">
              <Tag color={user?.role === 'admin' ? 'red' : 'blue'}>{user?.role}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Space>

        <Divider />

        <div>
          <Text strong>Stockage archives</Text>
          <div style={{ marginTop: 8 }}>
            <Progress
              percent={quotaPercent}
              format={() => `${formatBytes(storageUsedBytes)} / ${formatBytes(quotaBytes)}`}
              status={quotaPercent > 90 ? 'exception' : 'normal'}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Text strong>Comptes Gmail</Text>
          <Text type="secondary" style={{ marginLeft: 8 }}>
            {gmailAccounts.length} / {user?.max_gmail_accounts ?? 3}
          </Text>
        </div>
      </Card>

      <Card title="Comptes Gmail connectés">
        <List
          dataSource={gmailAccounts}
          locale={{ emptyText: 'Aucun compte Gmail connecté' }}
          renderItem={(account) => (
            <List.Item
              actions={[
                <Popconfirm
                  title="Déconnecter ce compte ?"
                  description="Les archives existantes ne seront pas supprimées."
                  onConfirm={() => disconnectAccount(account.id)}
                  okText="Déconnecter"
                  cancelText="Annuler"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />} size="small">
                    Déconnecter
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<GoogleOutlined />} style={{ backgroundColor: '#4285F4' }} />}
                title={
                  <Space>
                    {account.email}
                    {account.is_active && <Tag color="success">Actif</Tag>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />

        <Divider />

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={connectGmail}
          loading={connecting}
        >
          Connecter un compte Gmail
        </Button>

        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Scopes requis : gmail.modify, gmail.labels — aucune donnée n'est stockée hors de votre NAS.
          </Text>
        </div>
      </Card>

      {/* 2FA / TOTP */}
      <Card title={<><SafetyOutlined /> Authentification à deux facteurs (2FA)</>} style={{ marginTop: 24 }}>
        {(user as any)?.totp_enabled ? (
          <>
            <Alert type="success" message="2FA activé" showIcon style={{ marginBottom: 16 }} />
            <Space>
              <Input
                placeholder="Code TOTP"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                style={{ width: 140 }}
              />
              <Popconfirm
                title="Désactiver la 2FA ?"
                description="Vous devrez fournir un code TOTP valide."
                onConfirm={async () => {
                  if (totpCode.length !== 6) return
                  setTotpLoading(true)
                  try {
                    await twoFactorApi.disable(totpCode)
                    message.success('2FA désactivé')
                    setTotpCode('')
                    setTotpSetup(null)
                    fetchMe()
                  } catch (e: any) {
                    message.error(e.response?.data?.error || 'Erreur')
                  } finally {
                    setTotpLoading(false)
                  }
                }}
                okText="Désactiver"
                cancelText="Annuler"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<LockOutlined />} loading={totpLoading}>
                  Désactiver la 2FA
                </Button>
              </Popconfirm>
            </Space>
          </>
        ) : totpSetup ? (
          <>
            <Text>Scannez ce QR code avec votre application d'authentification (Google Authenticator, Authy, etc.) :</Text>
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <img src={totpSetup.qrDataUrl} alt="QR Code TOTP" style={{ maxWidth: 200 }} />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Clé manuelle : <code>{totpSetup.secret}</code>
            </Text>
            <Divider />
            <Space>
              <Input
                placeholder="Code à 6 chiffres"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                style={{ width: 160 }}
              />
              <Button
                type="primary"
                icon={<LockOutlined />}
                loading={totpLoading}
                disabled={totpCode.length !== 6}
                onClick={async () => {
                  setTotpLoading(true)
                  try {
                    await twoFactorApi.enable(totpCode)
                    message.success('2FA activé avec succès !')
                    setTotpSetup(null)
                    setTotpCode('')
                    fetchMe()
                  } catch (e: any) {
                    message.error(e.response?.data?.error || 'Code invalide')
                  } finally {
                    setTotpLoading(false)
                  }
                }}
              >
                Vérifier et activer
              </Button>
              <Button onClick={() => { setTotpSetup(null); setTotpCode('') }}>Annuler</Button>
            </Space>
          </>
        ) : (
          <>
            <Text>Protégez votre compte avec un code TOTP généré par une application d'authentification.</Text>
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                icon={<SafetyOutlined />}
                loading={totpLoading}
                onClick={async () => {
                  setTotpLoading(true)
                  try {
                    const data = await twoFactorApi.setup()
                    setTotpSetup(data)
                  } catch (e: any) {
                    message.error(e.response?.data?.error || 'Erreur')
                  } finally {
                    setTotpLoading(false)
                  }
                }}
              >
                Configurer la 2FA
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Notification Preferences */}
      <Card title={<><BellOutlined /> Préférences de notifications</>} style={{ marginTop: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Choisissez les notifications que vous souhaitez recevoir et par quel canal.
        </Text>
        <Table
          dataSource={[
            { key: 'weekly_report', label: 'Rapport hebdomadaire', desc: 'Résumé d\'activité chaque lundi', webhookEvent: null },
            { key: 'job_completed', label: 'Job terminé', desc: 'Quand un job (bulk, archivage, règle) se termine', webhookEvent: 'job.completed' },
            { key: 'job_failed', label: 'Job en échec', desc: 'Quand un job échoue', webhookEvent: 'job.failed' },
            { key: 'rule_executed', label: 'Règle exécutée', desc: 'Quand une règle automatique s\'exécute', webhookEvent: 'rule.executed' },
            { key: 'quota_warning', label: 'Alerte quota', desc: 'Quand le stockage approche la limite', webhookEvent: 'quota.warning' },
            { key: 'integrity_alert', label: 'Alerte intégrité', desc: 'Problème détecté dans les archives', webhookEvent: 'integrity.failed' },
          ]}
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Notification',
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
              title: '🔔 In-app',
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
              title: '💬 Toast',
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
              title: '🔗 Webhook',
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
          🔔 In-app = cloche dans le header · 💬 Toast = pop-up temporaire · 🔗 Webhook = push vers Discord, Slack, Ntfy, etc. (configurer ci-dessous)
        </Text>
      </Card>

      {/* Webhooks */}
      <Card title={<><ApiOutlined /> Webhooks</>} style={{ marginTop: 24 }}>
        <List
          dataSource={webhooks}
          locale={{ emptyText: 'Aucun webhook configuré' }}
          renderItem={(wh: any) => (
            <List.Item actions={[
              <Switch size="small" checked={wh.is_active} onChange={() => webhooksApi.toggle(wh.id).then(fetchWebhooks)} />,
              <Button size="small" onClick={async () => { await webhooksApi.test(wh.id); message.success('Test envoyé') }}>Test</Button>,
              <Popconfirm title="Supprimer ce webhook ?" onConfirm={() => webhooksApi.remove(wh.id).then(fetchWebhooks)}>
                <Button danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}>
              <List.Item.Meta
                title={<Space>{wh.name} <Tag>{wh.type}</Tag> {wh.last_status && <Tag color={wh.last_status < 300 ? 'green' : 'red'}>{wh.last_status}</Tag>}</Space>}
                description={<Text type="secondary" style={{ fontSize: 12 }}>{wh.events.join(', ')}</Text>}
              />
            </List.Item>
          )}
        />
        <Divider />
        <Button icon={<PlusOutlined />} onClick={() => { webhookForm.resetFields(); setWebhookModal(true) }}>
          Ajouter un webhook
        </Button>
        <Modal
          title="Nouveau webhook"
          open={webhookModal}
          onCancel={() => setWebhookModal(false)}
          onOk={() => webhookForm.validateFields().then(async (vals) => {
            await webhooksApi.create(vals)
            setWebhookModal(false)
            fetchWebhooks()
            message.success('Webhook créé')
          })}
        >
          <Form form={webhookForm} layout="vertical">
            <Form.Item name="name" label="Nom" rules={[{ required: true }]}>
              <Input placeholder="Mon webhook Discord" />
            </Form.Item>
            <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url' }]}>
              <Input placeholder="https://discord.com/api/webhooks/..." />
            </Form.Item>
            <Form.Item name="type" label="Type" initialValue="generic">
              <Select options={[
                { value: 'generic', label: 'Générique (HMAC)' },
                { value: 'discord', label: 'Discord' },
                { value: 'slack', label: 'Slack' },
                { value: 'ntfy', label: 'Ntfy' },
              ]} />
            </Form.Item>
            <Form.Item name="events" label="Événements" rules={[{ required: true }]}>
              <Select mode="multiple" placeholder="Sélectionner les événements" options={[
                { value: 'job.completed', label: 'Job terminé' },
                { value: 'job.failed', label: 'Job échoué' },
                { value: 'rule.executed', label: 'Règle exécutée' },
                { value: 'quota.warning', label: 'Alerte quota' },
                { value: 'integrity.failed', label: 'Intégrité échouée' },
              ]} />
            </Form.Item>
          </Form>
        </Modal>
      </Card>

      {/* Export / Import */}
      <Card title="Export / Import de configuration" style={{ marginTop: 24 }}>
        <Text>Exportez vos règles et webhooks en JSON, ou importez une configuration existante.</Text>
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>Exporter</Button>
            <Button icon={<UploadOutlined />} onClick={handleImport}>Importer</Button>
          </Space>
        </div>
      </Card>

      {/* Audit log */}
      <Card title={<><HistoryOutlined /> Journal d'activité</>} style={{ marginTop: 24 }}>
        <Table
          dataSource={auditLogs}
          rowKey="id"
          loading={auditLoading}
          size="small"
          pagination={{
            current: auditPage,
            total: auditTotal,
            pageSize: 10,
            onChange: (p) => fetchAuditLogs(p),
            showSizeChanger: false,
          }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'created_at',
              width: 170,
              render: (v: string) => new Date(v).toLocaleString('fr-FR'),
            },
            {
              title: 'Action',
              dataIndex: 'action',
              width: 180,
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: 'Cible',
              dataIndex: 'target_type',
              width: 120,
              render: (v: string, row: any) => v ? `${v} ${row.target_id ? '#' + row.target_id.slice(0, 8) : ''}` : '—',
            },
            {
              title: 'Détails',
              dataIndex: 'details',
              render: (v: any) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{JSON.stringify(v)}</Text> : '—',
            },
          ]}
        />
      </Card>
    </div>
  )
}
