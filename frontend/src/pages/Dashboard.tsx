import { useEffect, useState, useCallback } from 'react'
import {
  Row, Col, Card, Statistic, Table, Tag, Spin, Alert,
  Typography, Space, Button, Empty, Tooltip, Progress
} from 'antd'
import {
  MailOutlined, InboxOutlined, DatabaseOutlined,
  ReloadOutlined, WarningOutlined
} from '@ant-design/icons'
import { Bar, Pie, Line } from '@ant-design/charts'
import { useAccount } from '../hooks/useAccount'
import { dashboardApi } from '../api'
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

const LABEL_NAMES: Record<string, string> = {
  INBOX: 'Boîte de réception', UNREAD: 'Non lus', SENT: 'Envoyés',
  DRAFT: 'Brouillons', SPAM: 'Spam', TRASH: 'Corbeille',
  STARRED: 'Suivis', IMPORTANT: 'Importants',
  CATEGORY_PROMOTIONS: 'Promotions', CATEGORY_SOCIAL: 'Réseaux sociaux',
  CATEGORY_UPDATES: 'Mises à jour', CATEGORY_FORUMS: 'Forums',
}

export default function DashboardPage() {
  const { accountId, account } = useAccount()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [archiveStats, setArchiveStats] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!accountId) return
    setLoading(true); setError(null)
    try {
      const [s, a] = await Promise.all([
        dashboardApi.getStats(accountId, 20),
        dashboardApi.getArchiveStats(accountId),
      ])
      setStats(s); setArchiveStats(a)
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Erreur lors du chargement')
    } finally { setLoading(false) }
  }, [accountId])

  useEffect(() => { load() }, [load])

  if (!accountId) {
    return (
      <Empty
        description={<span>Aucun compte Gmail connecté. <a href="/settings">Connecter un compte</a></span>}
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
    tooltip: { items: [{ field: 'count', name: 'Mails' }] },
  }

  const labelPieConfig = {
    data: (stats?.byLabel ?? [])
      .filter((l) => !['UNREAD', 'STARRED', 'IMPORTANT'].includes(l.label))
      .slice(0, 8)
      .map((l) => ({ label: LABEL_NAMES[l.label] ?? l.label, count: l.count })),
    angleField: 'count', colorField: 'label',
    radius: 0.8, innerRadius: 0.55,
    height: 220,
    legend: { position: 'right' as const },
    label: false as any,
    tooltip: { items: [{ field: 'count', name: 'Mails' }] },
  }

  const biggestMailsColumns = [
    {
      title: 'Expéditeur', dataIndex: 'from', ellipsis: true, width: 170,
      render: (v: string) => (
        <Tooltip title={v}><Text style={{ fontSize: 12 }}>{formatSender(v)}</Text></Tooltip>
      ),
    },
    {
      title: 'Sujet', dataIndex: 'subject', ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '(sans sujet)'}</Text>,
    },
    {
      title: 'Taille', dataIndex: 'sizeEstimate', width: 90,
      sorter: (a: any, b: any) => a.sizeEstimate - b.sizeEstimate,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <Tag color="orange">{formatBytes(v)}</Tag>,
    },
    {
      title: 'Date', dataIndex: 'date', width: 100,
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
        <Title level={3} style={{ margin: 0 }}>📊 Dashboard</Title>
        {account && <Text type="secondary">{account.email}</Text>}
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading} size="small">
          Rafraîchir
        </Button>
      </Space>

      {error && (
        <Alert type="error" message={error} icon={<WarningOutlined />}
          showIcon closable style={{ marginBottom: 16 }} />
      )}

      <Spin spinning={loading} tip="Chargement des stats Gmail…">

        {/* KPIs */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            { title: 'Total messages', value: stats?.totalMessages ?? 0, icon: <MailOutlined />, format: true },
            { title: 'Non lus', value: stats?.unreadCount ?? 0, icon: <InboxOutlined />, color: stats?.unreadCount ? '#1677ff' : undefined },
            { title: 'Taille estimée', value: formatBytes(stats?.totalSizeBytes ?? 0), icon: <DatabaseOutlined /> },
            { title: 'Archivés (NAS)', value: archiveStats?.total_mails ?? 0, icon: <DatabaseOutlined style={{ color: '#52c41a' }} /> },
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
          <Card title="📅 Volume de mails par mois" size="small" style={{ marginBottom: 16 }}>
            <Line {...timelineConfig} />
          </Card>
        )}

        {/* Top expéditeurs */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} lg={12}>
            <Card title="👤 Top expéditeurs (nombre)" size="small">
              {(stats?.bySender?.length ?? 0) > 0
                ? <Bar {...topSendersByCount} />
                : <Empty description="Aucune donnée" />}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="⚖️ Top expéditeurs (taille)" size="small">
              {(stats?.bySender?.length ?? 0) > 0
                ? <Bar {...topSendersBySize} />
                : <Empty description="Aucune donnée" />}
            </Card>
          </Col>
        </Row>

        {/* Mails les plus gros + Labels */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card title="🐘 Mails les plus gros" size="small">
              <Table
                dataSource={stats?.biggestMails ?? []}
                columns={biggestMailsColumns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 8, size: 'small' }}
                locale={{ emptyText: 'Aucun mail' }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="🏷️ Répartition par label" size="small">
              {(stats?.byLabel?.length ?? 0) > 0 ? (
                <>
                  <Pie {...labelPieConfig} />
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Taux de lecture : </Text>
                    <Progress
                      percent={stats?.totalMessages
                        ? Math.round(((stats.totalMessages - stats.unreadCount) / stats.totalMessages) * 100)
                        : 0}
                      size="small" style={{ width: '100%' }}
                    />
                  </div>
                </>
              ) : <Empty description="Aucune donnée" />}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}
