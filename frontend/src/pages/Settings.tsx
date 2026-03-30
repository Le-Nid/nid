import { useEffect, useState } from 'react'
import { Card, Button, List, Avatar, Tag, Popconfirm, Typography, Alert, Space, Divider } from 'antd'
import { GoogleOutlined, DeleteOutlined, PlusOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'

const { Title, Text } = Typography

export default function SettingsPage() {
  const { gmailAccounts, fetchMe } = useAuthStore()
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
    } finally {
      setConnecting(false)
    }
  }

  const disconnectAccount = async (accountId: string) => {
    await api.delete(`/api/auth/gmail/${accountId}`)
    fetchMe()
  }

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
