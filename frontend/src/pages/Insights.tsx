import {
  Typography, Card, Row, Col, Statistic, Table, Empty, Tag, Spin,
} from 'antd'
import { CheckCircle, XCircle, Database, Bot, Mail, LineChart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatBytes } from '../utils/format'
import { useWeeklyReport } from '../hooks/queries'

const { Title, Text } = Typography

export default function InsightsPage() {
  const { t } = useTranslation()
  const { data: report, isLoading: loading, isError: error } = useWeeklyReport()

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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <LineChart size={20} />
        <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap' }}>{t('insights.title')}</Title>
        <Tag color="blue">{from} — {to}</Tag>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.jobsCompleted')}
              value={stats.jobsCompleted}
              prefix={<CheckCircle size={14} style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.jobsFailed')}
              value={stats.jobsFailed}
              prefix={<XCircle size={14} style={{ color: stats.jobsFailed > 0 ? '#ff4d4f' : '#d9d9d9' }} />}
              styles={stats.jobsFailed > 0 ? { content: { color: '#ff4d4f' } } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.mailsArchived')}
              value={stats.mailsArchived}
              prefix={<Database size={14} />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(stats.archiveSizeBytes)}</Text>}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('insights.rulesExecuted')}
              value={stats.rulesExecuted}
              prefix={<Bot size={14} />}
            />
          </Card>
        </Col>
      </Row>

      {stats.topSenders.length > 0 && (
        <Card title={<><Mail size={14} /> {t('insights.topSenders')}</>} size="small">
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
