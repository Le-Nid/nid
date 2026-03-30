import { useEffect, useState } from 'react'
import {
  Typography, Card, Row, Col, Statistic, Table, Empty, Space, Tag, Spin,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined,
  RobotOutlined, MailOutlined,
} from '@ant-design/icons'
import { reportsApi } from '../api'
import { useTranslation } from 'react-i18next'
import { formatBytes } from '../utils/format'

const { Title, Text } = Typography

interface WeeklyReport {
  userId: string
  email: string
  period: { from: string; to: string }
  stats: {
    jobsCompleted: number
    jobsFailed: number
    mailsArchived: number
    archiveSizeBytes: number
    rulesExecuted: number
    topSenders: { sender: string; count: number }[]
  }
}

export default function InsightsPage() {
  const { t } = useTranslation()
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    reportsApi.getWeekly()
      .then(setReport)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (error || !report) return <Empty description={t('insights.noData')} />

  const { stats, period } = report
  const from = new Date(period.from).toLocaleDateString()
  const to = new Date(period.to).toLocaleDateString()

  const senderColumns = [
    {
      title: t('insights.sender'),
      dataIndex: 'sender',
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: t('insights.archivedMails'),
      dataIndex: 'count',
      width: 140,
      render: (v: number) => <Tag>{v}</Tag>,
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={3} style={{ margin: 0 }}>{t('insights.title')}</Title>
        <Tag color="blue">{from} — {to}</Tag>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.jobsCompleted')}
              value={stats.jobsCompleted}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.jobsFailed')}
              value={stats.jobsFailed}
              prefix={<CloseCircleOutlined style={{ color: stats.jobsFailed > 0 ? '#ff4d4f' : '#d9d9d9' }} />}
              valueStyle={stats.jobsFailed > 0 ? { color: '#ff4d4f' } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.mailsArchived')}
              value={stats.mailsArchived}
              prefix={<DatabaseOutlined />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(stats.archiveSizeBytes)}</Text>}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.rulesExecuted')}
              value={stats.rulesExecuted}
              prefix={<RobotOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {stats.topSenders.length > 0 && (
        <Card title={<><MailOutlined /> {t('insights.topSenders')}</>} size="small">
          <Table
            dataSource={stats.topSenders}
            columns={senderColumns}
            rowKey="sender"
            size="small"
            pagination={false}
          />
        </Card>
      )}

      {stats.jobsCompleted === 0 && stats.mailsArchived === 0 && stats.rulesExecuted === 0 && (
        <Card style={{ textAlign: 'center', marginTop: 24 }}>
          <Text type="secondary">{t('insights.noActivity')}</Text>
        </Card>
      )}
    </div>
  )
}
