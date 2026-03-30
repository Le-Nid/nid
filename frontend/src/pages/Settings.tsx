import { useEffect, useState } from 'react'
import { Card, Button, List, Avatar, Tag, Popconfirm, Typography, Alert, Space, Divider, Progress, Descriptions, Table, Input, message } from 'antd'
import { GoogleOutlined, DeleteOutlined, PlusOutlined, CheckCircleOutlined, UserOutlined, HistoryOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'
import { formatBytes } from '../utils/format'
import { auditApi, twoFactorApi } from '../api'

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

  useEffect(() => { fetchAuditLogs() }, [])

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
