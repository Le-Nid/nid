import { useState } from 'react'
import {
  Table, Button, Typography, Space, Tag, Popconfirm, Tooltip, Card,
  Empty, Statistic, Row, Col, notification, message, Input,
} from 'antd'
import {
  DeleteOutlined, LinkOutlined, MailOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../hooks/useAccount'
import { formatBytes } from '../utils/format'
import JobProgressModal from '../components/JobProgressModal'
import { useNewsletters, useDeleteSender } from '../hooks/queries'

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
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const { data: newsletters = [], isLoading: loading, refetch } = useNewsletters(accountId)
  const load = () => { refetch() }
  const deleteSenderMutation = useDeleteSender(accountId!)
  const [search, setSearch] = useState('')
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const handleDelete = async (sender: NewsletterSender, permanent = false) => {
    setDeletingEmail(sender.email)
    try {
      const { jobId, count } = await deleteSenderMutation.mutateAsync({ email: sender.email, permanent })
      setActiveJobId(jobId)
      notification.success({
        title: t('unsubscribe.deleteStarted'),
        description: t('unsubscribe.deleteDesc', { count, sender: sender.sender }),
      })
    } catch {
      messageApi.error(t('unsubscribe.deleteError'))
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
      title: t('unsubscribe.sender'),
      key: 'sender',
      render: (_: any, row: NewsletterSender) => (
        <Space orientation="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{row.sender}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.email}</Text>
        </Space>
      ),
    },
    {
      title: t('unsubscribe.mails'),
      dataIndex: 'count',
      width: 90,
      sorter: (a: NewsletterSender, b: NewsletterSender) => a.count - b.count,
      render: (v: number) => <Tag>{v}</Tag>,
    },
    {
      title: t('unsubscribe.size'),
      dataIndex: 'totalSizeBytes',
      width: 110,
      sorter: (a: NewsletterSender, b: NewsletterSender) => a.totalSizeBytes - b.totalSizeBytes,
      render: (v: number) => formatBytes(v),
    },
    {
      title: t('unsubscribe.lastSent'),
      dataIndex: 'latestDate',
      width: 140,
      render: (v: string) => {
        try { return new Date(v).toLocaleDateString('fr-FR') } catch { return '-' }
      },
    },
    {
      title: t('unsubscribe.unsubscribeCol'),
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
              {t('unsubscribe.unsubscribeBtn')}
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
              {t('unsubscribe.byEmail')}
            </Button>
          )
        }
        return <Text type="secondary" style={{ fontSize: 11 }}>{t('unsubscribe.unavailable')}</Text>
      },
    },
    {
      title: '',
      width: 100,
      render: (_: any, row: NewsletterSender) => (
        <Space size="small">
          <Popconfirm
            title={t('unsubscribe.deleteConfirm', { count: row.count, sender: row.sender })}
            description={t('unsubscribe.deleteHint')}
            onConfirm={() => handleDelete(row, false)}
            okText={t('common.delete')}
            okButtonProps={{ danger: true }}
            cancelText={t('common.cancel')}
          >
            <Tooltip title={t('unsubscribe.trashMails')}>
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
        <Title level={3} style={{ margin: 0 }}>{t('unsubscribe.title')}</Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t('unsubscribe.scan')}
        </Button>
      </Space>

      {!accountId ? (
        <Empty description={t('unsubscribe.noAccount')} />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title={t('unsubscribe.detected')} value={newsletters.length} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title={t('unsubscribe.newsletterMails')} value={totalMails} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title={t('unsubscribe.spaceUsed')} value={formatBytes(totalSize)} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
                <Text style={{ fontSize: 13 }}>
                  {t('unsubscribe.hint')}
                </Text>
              </Card>
            </Col>
          </Row>

          <Input.Search
            placeholder={t('unsubscribe.searchPlaceholder')}
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
            locale={{ emptyText: <Empty description={loading ? t('common.loading') : t('unsubscribe.noNewsletters')} /> }}
          />

          <JobProgressModal jobId={activeJobId} onClose={() => { setActiveJobId(null); load() }} />
        </>
      )}
    </div>
  )
}
