import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Typography, Space, Tag, Popconfirm, Tooltip, Card,
  Empty, Statistic, Row, Col, notification, message, Input,
} from 'antd'
import {
  DeleteOutlined, LinkOutlined, MailOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { unsubscribeApi } from '../api'
import { useAccount } from '../hooks/useAccount'
import { formatBytes } from '../utils/format'
import JobProgressModal from '../components/JobProgressModal'

const { Title, Text } = Typography

interface NewsletterSender {
  sender: string
  email: string
  count: number
  totalSizeBytes: number
  unsubscribeUrl: string | null
  unsubscribeMailto: string | null
  latestDate: string
  sampleMessageIds: string[]
}

export default function UnsubscribePage() {
  const { accountId } = useAccount()
  const [newsletters, setNewsletters] = useState<NewsletterSender[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      const data = await unsubscribeApi.scanNewsletters(accountId)
      setNewsletters(data)
    } catch {
      messageApi.error('Erreur lors du scan des newsletters')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (sender: NewsletterSender, permanent = false) => {
    setDeletingEmail(sender.email)
    try {
      const { jobId, count } = await unsubscribeApi.deleteSender(accountId!, sender.email, permanent)
      setActiveJobId(jobId)
      notification.success({
        message: `Suppression lancée`,
        description: `${count} mails de ${sender.sender} seront ${permanent ? 'supprimés définitivement' : 'mis à la corbeille'}.`,
      })
    } catch {
      messageApi.error('Erreur lors de la suppression')
    } finally {
      setDeletingEmail(null)
    }
  }

  const totalMails = newsletters.reduce((s, n) => s + n.count, 0)
  const totalSize = newsletters.reduce((s, n) => s + n.totalSizeBytes, 0)

  const filtered = search
    ? newsletters.filter((n) =>
        n.sender.toLowerCase().includes(search.toLowerCase()) ||
        n.email.toLowerCase().includes(search.toLowerCase())
      )
    : newsletters

  const columns = [
    {
      title: 'Expéditeur',
      key: 'sender',
      render: (_: any, row: NewsletterSender) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{row.sender}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.email}</Text>
        </Space>
      ),
    },
    {
      title: 'Mails',
      dataIndex: 'count',
      width: 90,
      sorter: (a: NewsletterSender, b: NewsletterSender) => a.count - b.count,
      render: (v: number) => <Tag>{v}</Tag>,
    },
    {
      title: 'Taille',
      dataIndex: 'totalSizeBytes',
      width: 110,
      sorter: (a: NewsletterSender, b: NewsletterSender) => a.totalSizeBytes - b.totalSizeBytes,
      render: (v: number) => formatBytes(v),
    },
    {
      title: 'Dernier envoi',
      dataIndex: 'latestDate',
      width: 140,
      render: (v: string) => {
        try { return new Date(v).toLocaleDateString('fr-FR') } catch { return '-' }
      },
    },
    {
      title: 'Désinscription',
      width: 130,
      render: (_: any, row: NewsletterSender) => {
        if (row.unsubscribeUrl) {
          return (
            <Button
              size="small"
              type="link"
              icon={<LinkOutlined />}
              href={row.unsubscribeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Se désinscrire
            </Button>
          )
        }
        if (row.unsubscribeMailto) {
          return (
            <Button
              size="small"
              type="link"
              icon={<MailOutlined />}
              href={row.unsubscribeMailto}
            >
              Par email
            </Button>
          )
        }
        return <Text type="secondary" style={{ fontSize: 11 }}>Non disponible</Text>
      },
    },
    {
      title: '',
      width: 100,
      render: (_: any, row: NewsletterSender) => (
        <Space size="small">
          <Popconfirm
            title={`Supprimer ${row.count} mails de ${row.sender} ?`}
            description="Les mails seront mis à la corbeille."
            onConfirm={() => handleDelete(row, false)}
            okText="Supprimer"
            okButtonProps={{ danger: true }}
            cancelText="Annuler"
          >
            <Tooltip title="Mettre à la corbeille">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={deletingEmail === row.email}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {contextHolder}

      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={3} style={{ margin: 0 }}>📧 Newsletters & Listes</Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Scanner
        </Button>
      </Space>

      {!accountId ? (
        <Empty description="Aucun compte Gmail connecté" />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Newsletters détectées" value={newsletters.length} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Mails newsletter" value={totalMails} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Espace occupé" value={formatBytes(totalSize)} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
                <Text style={{ fontSize: 13 }}>
                  Cliquez sur <strong>Se désinscrire</strong> puis <DeleteOutlined /> pour nettoyer.
                </Text>
              </Card>
            </Col>
          </Row>

          <Input.Search
            placeholder="Rechercher un expéditeur..."
            style={{ marginBottom: 12, maxWidth: 400 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />

          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="email"
            loading={loading}
            size="small"
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} newsletters` }}
            locale={{ emptyText: <Empty description={loading ? 'Scan en cours...' : 'Aucune newsletter détectée. Cliquez sur Scanner.'} /> }}
          />

          <JobProgressModal jobId={activeJobId} onClose={() => { setActiveJobId(null); load() }} />
        </>
      )}
    </div>
  )
}
