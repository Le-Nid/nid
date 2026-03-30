import { useEffect, useState } from 'react'
import { Card, Button, List, Avatar, Tag, Popconfirm, Typography, Alert, Space, Divider, Progress, Descriptions } from 'antd'
import { GoogleOutlined, DeleteOutlined, PlusOutlined, CheckCircleOutlined, UserOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'
import { formatBytes } from '../utils/format'

const { Title, Text } = Typography

export default function SettingsPage() {
  const { user, gmailAccounts, fetchMe, storageUsedBytes } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [connecting, setConnecting] = useState(false)

  const gmailStatus = searchParams.get('gmail')
  const connectedEmail = searchParams.get('account')

  useEffect(() => {
    if (gmailStatus === 'connected') fetchMe()
  }, [gmailStatus])

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
    </div>
  )
}
