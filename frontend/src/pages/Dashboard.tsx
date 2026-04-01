import {
  Row, Col, Card, Statistic, Table, Tag, Spin, Alert,
  Typography, Space, Button, Empty, Tooltip, Progress
} from 'antd'
import {
  MailOutlined, InboxOutlined, DatabaseOutlined,
  ReloadOutlined, WarningOutlined
} from '@ant-design/icons'
import { Bar, Pie, Line } from '@ant-design/charts'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../hooks/useAccount'
import { useDashboardStats, useDashboardArchiveStats } from '../hooks/queries'
import { formatBytes, formatSender } from '../utils/format'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface DashboardStats {
  totalMessages: number
  unreadCount: number
  totalSizeBytes: number
  bySender: { sender: string; count: number; sizeBytes: number }[]
  biggestMails: { id: string; subject: string; sizeEstimate: number; from: string; date: string }[]
  byLabel: { label: string; count: number }[]
  timeline: { month: string; count: number }[]
  profile: { emailAddress: string; messagesTotal: number }
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const { accountId, account } = useAccount()
  const { data: stats = null, isLoading: loadingStats, error: statsError, refetch: refetchStats } = useDashboardStats(accountId)
  const { data: archiveStats = null, refetch: refetchArchive } = useDashboardArchiveStats(accountId)

  const loading = loadingStats
  const error = statsError ? (statsError as any).response?.data?.error ?? t('dashboard.loadError') : null
  const load = () => { refetchStats(); refetchArchive() }

  if (!accountId) {
    return (
      <Empty
        description={<span>{t('dashboard.noAccount')} <a href="/settings">{t('dashboard.connectAccount')}</a></span>}
      />
    )
  }

  const topSendersByCount = {
    data: (stats?.bySender ?? []).slice(0, 15).map((s) => ({
      sender: formatSender(s.sender).slice(0, 35),
      count: s.count,
    })),
    xField: 'count', yField: 'sender',
    label: { position: 'right' as const, style: { fontSize: 11 } },
    height: 380,
    colorField: () => '#1677ff',
  }

  const topSendersBySize = {
    data: (stats?.bySender ?? [])
      .slice().sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 15)
      .map((s) => ({
        sender: formatSender(s.sender).slice(0, 35),
        sizeMo: Math.round((s.sizeBytes / 1024 / 1024) * 10) / 10,
      })),
    xField: 'sizeMo', yField: 'sender',
    label: {
      position: 'right' as const,
      formatter: (_: any, item: any) => `${item.sizeMo} Mo`,
      style: { fontSize: 11 },
    },
    axis: { x: { labelFormatter: (v: number) => `${v} Mo` } },
    height: 380,
    colorField: () => '#52c41a',
  }

  const timelineConfig = {
    data: stats?.timeline ?? [],
    xField: 'month', yField: 'count',
    smooth: true,
    point: { size: 3, fill: '#1677ff' },
    height: 200,
    axis: { x: { labelFormatter: (v: string) => dayjs(v + '-01').format('MMM YY') } },
    tooltip: { items: [{ field: 'count', name: t('dashboard.mails') }] },
  }

  const labelPieConfig = {
    data: (stats?.byLabel ?? [])
      .filter((l) => !['UNREAD', 'STARRED', 'IMPORTANT'].includes(l.label))
      .slice(0, 8)
      .map((l) => ({ label: t(`labels.${l.label}`, { defaultValue: l.label }), count: l.count })),
    angleField: 'count', colorField: 'label',
    radius: 0.8, innerRadius: 0.55,
    height: 220,
    legend: { position: 'right' as const },
    label: false as any,
    tooltip: { items: [{ field: 'count', name: t('dashboard.mails') }] },
  }

  const biggestMailsColumns = [
    {
      title: t('dashboard.sender'), dataIndex: 'from', ellipsis: true, width: 170,
      render: (v: string) => (
        <Tooltip title={v}><Text style={{ fontSize: 12 }}>{formatSender(v)}</Text></Tooltip>
      ),
    },
    {
      title: t('dashboard.subject'), dataIndex: 'subject', ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || t('common.noSubject')}</Text>,
    },
    {
      title: t('dashboard.size'), dataIndex: 'sizeEstimate', width: 90,
      sorter: (a: any, b: any) => a.sizeEstimate - b.sizeEstimate,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <Tag color="orange">{formatBytes(v)}</Tag>,
    },
    {
      title: t('dashboard.date'), dataIndex: 'date', width: 100,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? dayjs(v).format('DD/MM/YY') : '—'}
        </Text>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 20 }} align="center">
        <Title level={3} style={{ margin: 0 }}>{t('dashboard.title')}</Title>
        {account && <Text type="secondary">{account.email}</Text>}
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading} size="small">
          {t('common.refresh')}
        </Button>
      </Space>

      {error && (
        <Alert type="error" title={error} icon={<WarningOutlined />}
          showIcon closable style={{ marginBottom: 16 }} />
      )}

      <Spin spinning={loading} tip={t('dashboard.loadingStats')}>

        {/* KPIs */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            { title: t('dashboard.totalMessages'), value: stats?.totalMessages ?? 0, icon: <MailOutlined />, format: true },
            { title: t('dashboard.unread'), value: stats?.unreadCount ?? 0, icon: <InboxOutlined />, color: stats?.unreadCount ? '#1677ff' : undefined },
            { title: t('dashboard.estimatedSize'), value: formatBytes(stats?.totalSizeBytes ?? 0), icon: <DatabaseOutlined /> },
            { title: t('dashboard.archivedNas'), value: archiveStats?.total_mails ?? 0, icon: <DatabaseOutlined style={{ color: '#52c41a' }} /> },
          ].map((kpi) => (
            <Col xs={24} sm={12} lg={6} key={kpi.title}>
              <Card size="small">
                <Statistic
                  title={kpi.title}
                  value={kpi.value}
                  prefix={kpi.icon}
                  valueStyle={kpi.color ? { color: kpi.color } : undefined}
                  formatter={kpi.format ? (v) => Number(v).toLocaleString('fr-FR') : undefined}
                />
              </Card>
            </Col>
          ))}
        </Row>

        {/* Timeline */}
        {(stats?.timeline?.length ?? 0) > 0 && (
          <Card title={t('dashboard.timelineTitle')} size="small" style={{ marginBottom: 16 }}>
            <Line {...timelineConfig} />
          </Card>
        )}

        {/* Top expéditeurs */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} lg={12}>
            <Card title={t('dashboard.topSendersCount')} size="small">
              {(stats?.bySender?.length ?? 0) > 0
                ? <Bar {...topSendersByCount} />
                : <Empty description={t('common.noData')} />}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={t('dashboard.topSendersSize')} size="small">
              {(stats?.bySender?.length ?? 0) > 0
                ? <Bar {...topSendersBySize} />
                : <Empty description={t('common.noData')} />}
            </Card>
          </Col>
        </Row>

        {/* Mails les plus gros + Labels */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card title={t('dashboard.biggestMails')} size="small">
              <Table
                dataSource={stats?.biggestMails ?? []}
                columns={biggestMailsColumns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 8, size: 'small' }}
                locale={{ emptyText: t('dashboard.noMail') }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title={t('dashboard.labelDistribution')} size="small">
              {(stats?.byLabel?.length ?? 0) > 0 ? (
                <>
                  <Pie {...labelPieConfig} />
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.readRate')} </Text>
                    <Progress
                      percent={stats?.totalMessages
                        ? Math.round(((stats.totalMessages - stats.unreadCount) / stats.totalMessages) * 100)
                        : 0}
                      size="small" style={{ width: '100%' }}
                    />
                  </div>
                </>
              ) : <Empty description={t('common.noData')} />}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}
