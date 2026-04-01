import React from 'react'
import {
  Typography, Card, Row, Col, Table, Tag, Spin, Alert, Space, Button,
  Tooltip, Progress, Statistic, Empty, message,
} from 'antd'
import {
  ReloadOutlined, FireOutlined, TrophyOutlined, DeleteOutlined,
  WarningOutlined, InboxOutlined, CloseOutlined, RiseOutlined,
} from '@ant-design/icons'
import { Line } from '@ant-design/charts'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../hooks/useAccount'
import { useAnalytics, useDismissSuggestion } from '../hooks/queries'
import { formatBytes, formatSender } from '../utils/format'
import { useQueryClient } from '@tanstack/react-query'

const { Title, Text } = Typography

// ─── Types ──────────────────────────────────────────────

interface HeatmapCell {
  day: number
  hour: number
  count: number
}

interface SenderScore {
  sender: string
  emailCount: number
  totalSizeBytes: number
  unreadCount: number
  hasUnsubscribe: boolean
  readRate: number
  clutterScore: number
}

// ─── Composant Heatmap ──────────────────────────────────

const DAY_LABELS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function HeatmapGrid({ data, lang }: Readonly<{ data: HeatmapCell[]; lang: string }>) {
  const dayLabels = lang.startsWith('en') ? DAY_LABELS_EN : DAY_LABELS_FR

  // Construire la grille 7×24
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  let max = 1
  for (const cell of data) {
    grid[cell.day][cell.hour] = cell.count
    if (cell.count > max) max = cell.count
  }

  const getColor = (count: number) => {
    if (count === 0) return 'var(--heatmap-empty, #ebedf0)'
    const intensity = count / max
    if (intensity < 0.25) return '#9be9a8'
    if (intensity < 0.5) return '#40c463'
    if (intensity < 0.75) return '#30a14e'
    return '#216e39'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(24, 1fr)', gap: 2, minWidth: 600 }}>
        {/* Header heures */}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} style={{ textAlign: 'center', fontSize: 10, color: '#888' }}>
            {h}h
          </div>
        ))}

        {/* Lignes par jour */}
        {dayLabels.map((label, day) => (
          <React.Fragment key={label}>
            <div style={{ fontSize: 11, lineHeight: '24px', color: '#666' }}>
              {label}
            </div>
            {Array.from({ length: 24 }, (_, hour) => (
              <Tooltip key={`${label}-${hour}`} title={`${label} ${hour}h : ${grid[day][hour]} emails`}>
                <div
                  style={{
                    width: '100%',
                    paddingBottom: '100%',
                    backgroundColor: getColor(grid[day][hour]),
                    borderRadius: 2,
                    cursor: 'default',
                  }}
                />
              </Tooltip>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─── Composant Score couleur ────────────────────────────

function ScoreTag({ score }: Readonly<{ score: number }>) {
  let color = 'green'
  if (score >= 70) color = 'red'
  else if (score >= 40) color = 'orange'
  return <Tag color={color}>{score}/100</Tag>
}

// ─── Page Analytics ─────────────────────────────────────

export default function AnalyticsPage() {
  const { t, i18n } = useTranslation()
  const { accountId } = useAccount()
  const queryClient = useQueryClient()

  const { heatmap: heatmapQuery, senderScores: senderScoresQuery, suggestions: suggestionsQuery, inboxZero: inboxZeroQuery } = useAnalytics(accountId)
  const dismissMutation = useDismissSuggestion()

  const heatmap = heatmapQuery.data ?? []
  const senderScores = senderScoresQuery.data ?? []
  const suggestions = suggestionsQuery.data ?? []
  const inboxZero = inboxZeroQuery.data ?? null
  const loading = heatmapQuery.isLoading || senderScoresQuery.isLoading
  const error = heatmapQuery.error ? (heatmapQuery.error as any).response?.data?.error ?? t('analytics.loadError') : null

  const load = (refresh = false) => {
    if (refresh && accountId) {
      queryClient.invalidateQueries({ queryKey: ['analytics', accountId] })
    }
  }

  const handleDismiss = async (id: string) => {
    try {
      await dismissMutation.mutateAsync(id)
      message.success(t('analytics.dismissed'))
    } catch {
      message.error(t('common.error'))
    }
  }

  if (!accountId) {
    return <Empty description={t('analytics.noAccount')} />
  }

  // Colonnes sender scores
  const senderColumns = [
    {
      title: t('analytics.sender'),
      dataIndex: 'sender',
      render: (v: string) => <Text style={{ fontSize: 13 }}>{formatSender(v)}</Text>,
      ellipsis: true,
    },
    {
      title: t('analytics.volume'),
      dataIndex: 'emailCount',
      width: 90,
      sorter: (a: SenderScore, b: SenderScore) => a.emailCount - b.emailCount,
    },
    {
      title: t('analytics.size'),
      dataIndex: 'totalSizeBytes',
      width: 100,
      render: (v: number) => formatBytes(v),
      sorter: (a: SenderScore, b: SenderScore) => a.totalSizeBytes - b.totalSizeBytes,
    },
    {
      title: t('analytics.unread'),
      dataIndex: 'unreadCount',
      width: 90,
      sorter: (a: SenderScore, b: SenderScore) => a.unreadCount - b.unreadCount,
    },
    {
      title: t('analytics.readRate'),
      dataIndex: 'readRate',
      width: 110,
      render: (v: number) => <Progress percent={Math.round(v * 100)} size="small" />,
      sorter: (a: SenderScore, b: SenderScore) => a.readRate - b.readRate,
    },
    {
      title: t('analytics.clutterScore'),
      dataIndex: 'clutterScore',
      width: 120,
      render: (v: number) => <ScoreTag score={v} />,
      sorter: (a: SenderScore, b: SenderScore) => a.clutterScore - b.clutterScore,
      defaultSortOrder: 'descend' as const,
    },
  ]

  // Config graphique Inbox Zero
  const inboxZeroChartConfig = {
    data: inboxZero?.history.map((h: { date: string; inboxCount: number }) => ({
      date: h.date,
      count: h.inboxCount,
    })) ?? [],
    xField: 'date',
    yField: 'count',
    smooth: true,
    height: 200,
    point: { size: 3 },
    color: '#1677ff',
    yAxis: { min: 0 },
  }

  const suggestionTypeIcons: Record<string, React.ReactNode> = {
    bulk_unread: <WarningOutlined style={{ color: '#faad14' }} />,
    large_sender: <FireOutlined style={{ color: '#ff4d4f' }} />,
    old_newsletters: <DeleteOutlined style={{ color: '#8c8c8c' }} />,
    duplicate_pattern: <WarningOutlined style={{ color: '#faad14' }} />,
  }

  return (
    <div>
      <Space style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>{t('analytics.title')}</Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => load(true)}
          loading={loading}
          size="small"
        >
          {t('common.refresh')}
        </Button>
      </Space>

      {error && <Alert type="error" title={error} showIcon closable style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>
        {/* ─── Inbox Zero Tracker ──────────────────────────── */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title={t('analytics.inboxCount')}
                value={inboxZero?.current.inboxCount ?? 0}
                prefix={<InboxOutlined />}
                valueStyle={inboxZero?.current.inboxCount === 0 ? { color: '#52c41a' } : undefined}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title={t('analytics.unreadCount')}
                value={inboxZero?.current.unreadCount ?? 0}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title={t('analytics.streak')}
                value={inboxZero?.streak ?? 0}
                prefix={<FireOutlined style={{ color: '#ff4d4f' }} />}
                suffix={t('analytics.days')}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title={t('analytics.bestStreak')}
                value={inboxZero?.bestStreak ?? 0}
                prefix={<TrophyOutlined style={{ color: '#faad14' }} />}
                suffix={t('analytics.days')}
              />
            </Card>
          </Col>
        </Row>

        {/* ─── Inbox Zero graphique ────────────────────────── */}
        {inboxZero && inboxZero.history.length > 1 && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24}>
              <Card title={<><RiseOutlined /> {t('analytics.inboxZeroHistory')}</>} size="small">
                <Line {...inboxZeroChartConfig} />
              </Card>
            </Col>
          </Row>
        )}

        {/* ─── Heatmap d'activité ──────────────────────────── */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24}>
            <Card title={t('analytics.heatmapTitle')} size="small">
              {heatmap.length > 0 ? (
                <HeatmapGrid data={heatmap} lang={i18n.language} />
              ) : (
                <Empty description={t('common.noData')} />
              )}
            </Card>
          </Col>
        </Row>

        {/* ─── Suggestions de nettoyage ────────────────────── */}
        {suggestions.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24}>
              <Card title={<><WarningOutlined style={{ color: '#faad14' }} /> {t('analytics.suggestionsTitle')}</>} size="small">
                {suggestions.map((s: { id: string; type: string; title: string; description: string | null; emailCount: number; totalSizeBytes: number }) => (
                  <Card
                    key={s.id}
                    size="small"
                    style={{ marginBottom: 8 }}
                    extra={
                      <Button
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => handleDismiss(s.id)}
                        type="text"
                        aria-label={t('analytics.dismiss')}
                      />
                    }
                  >
                    <Space>
                      {suggestionTypeIcons[s.type] ?? <WarningOutlined />}
                      <div>
                        <Text strong>{s.title}</Text>
                        {s.description && (
                          <div><Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text></div>
                        )}
                        <Space style={{ marginTop: 4 }}>
                          <Tag>{s.emailCount} emails</Tag>
                          <Tag>{formatBytes(s.totalSizeBytes)}</Tag>
                        </Space>
                      </div>
                    </Space>
                  </Card>
                ))}
              </Card>
            </Col>
          </Row>
        )}

        {/* ─── Score d'encombrement par expéditeur ─────────── */}
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card title={<><FireOutlined style={{ color: '#ff4d4f' }} /> {t('analytics.senderScoresTitle')}</>} size="small">
              <Table
                dataSource={senderScores}
                columns={senderColumns}
                rowKey="sender"
                size="small"
                pagination={{ pageSize: 15 }}
                scroll={{ x: 700 }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}
