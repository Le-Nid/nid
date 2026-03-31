import { useEffect, useState, useCallback } from 'react'
import {
  Typography, Card, Row, Col, Statistic, Table, Tabs, Button, Space,
  Tag, Tooltip, Progress, Input, Alert, message, Spin,
} from 'antd'
import {
  EyeOutlined, ScanOutlined, LockOutlined, WarningOutlined,
  SafetyOutlined, ReloadOutlined, ExclamationCircleOutlined,
  BugOutlined, KeyOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { privacyApi } from '../api'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../hooks/useAccount'
import JobProgressModal from '../components/JobProgressModal'
import type {
  TrackingStats, TrackedMessage, PiiStats, PiiFinding,
  EncryptionStatus, TrackerInfo,
} from '../types/privacy'
import { PII_TYPE_LABELS, TRACKER_TYPE_LABELS } from '../types/privacy'

const { Title, Text } = Typography

export default function PrivacyPage() {
  const { t, i18n } = useTranslation()
  const { accountId } = useAccount()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'fr'
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 16 }} align="center">
        <SafetyOutlined style={{ fontSize: 24 }} />
        <Title level={3} style={{ margin: 0 }}>{t('privacy.title')}</Title>
      </Space>

      <Tabs
        items={[
          {
            key: 'tracking',
            label: <><EyeOutlined /> {t('privacy.tracking.tab')}</>,
            children: <TrackingTab accountId={accountId} lang={lang} messageApi={messageApi} setActiveJobId={setActiveJobId} />,
          },
          {
            key: 'pii',
            label: <><BugOutlined /> {t('privacy.pii.tab')}</>,
            children: <PiiTab accountId={accountId} lang={lang} messageApi={messageApi} setActiveJobId={setActiveJobId} />,
          },
          {
            key: 'encryption',
            label: <><LockOutlined /> {t('privacy.encryption.tab')}</>,
            children: <EncryptionTab accountId={accountId} messageApi={messageApi} setActiveJobId={setActiveJobId} />,
          },
        ]}
      />

      {activeJobId && (
        <JobProgressModal
          jobId={activeJobId}
          onClose={() => setActiveJobId(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// TRACKING PIXELS TAB
// ═══════════════════════════════════════════════════════════

function TrackingTab({ accountId, lang, messageApi, setActiveJobId }: Readonly<{
  accountId: string | null; lang: string; messageApi: any; setActiveJobId: (id: string | null) => void
}>) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<TrackingStats | null>(null)
  const [messages, setMessages] = useState<TrackedMessage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  const loadStats = useCallback(async () => {
    if (!accountId) return
    try {
      const data = await privacyApi.getTrackingStats(accountId)
      setStats(data)
    } catch { /* ignore */ }
  }, [accountId])

  const loadMessages = useCallback(async (p = 1) => {
    if (!accountId) return
    setLoading(true)
    try {
      const data = await privacyApi.listTrackedMessages(accountId, { page: p, limit: 20 })
      setMessages(data.items)
      setTotal(data.total)
      setPage(p)
    } catch { /* ignore */ }
    setLoading(false)
  }, [accountId])

  useEffect(() => { loadStats(); loadMessages() }, [loadStats, loadMessages])

  const handleScan = async () => {
    if (!accountId) return
    setScanning(true)
    try {
      const { jobId } = await privacyApi.scanTracking(accountId)
      setActiveJobId(jobId)
    } catch {
      messageApi.error(t('privacy.tracking.scanError'))
    }
    setScanning(false)
  }

  const trackerColumns = [
    {
      title: t('privacy.tracking.sender'),
      dataIndex: 'sender',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v || '—'}</Text>,
    },
    {
      title: t('privacy.tracking.subject'),
      dataIndex: 'subject',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v || t('common.noSubject')}</Text>,
    },
    {
      title: t('privacy.tracking.date'),
      dataIndex: 'date',
      width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
    },
    {
      title: t('privacy.tracking.trackers'),
      dataIndex: 'tracker_count',
      width: 100,
      render: (v: number) => <Tag color="red">{v}</Tag>,
    },
    {
      title: t('privacy.tracking.types'),
      dataIndex: 'trackers',
      width: 200,
      render: (trackers: TrackerInfo[]) => {
        const colorMap: Record<string, string> = { pixel: 'volcano', utm: 'orange' }
        return (
          <Space size={[0, 4]} wrap>
            {[...new Set(trackers.map((t) => t.type))].map((type) => (
              <Tag key={type} color={colorMap[type] ?? 'gold'}>
                {TRACKER_TYPE_LABELS[type]?.[lang as 'fr' | 'en'] ?? type}
              </Tag>
            ))}
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={t('privacy.tracking.trackedMails')}
              value={stats?.trackedMessages ?? 0}
              prefix={<EyeOutlined style={{ color: '#ff4d4f' }} />}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={t('privacy.tracking.totalTrackers')}
              value={stats?.totalTrackers ?? 0}
              prefix={<WarningOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={t('privacy.tracking.topDomain')}
              value={stats?.topDomains?.[0]?.domain ?? '—'}
              valueStyle={{ fontSize: 16 }}
            />
          </Card>
        </Col>
      </Row>

      {stats?.topDomains && stats.topDomains.length > 0 && (
        <Card
          title={t('privacy.tracking.topDomains')}
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Space wrap>
            {stats.topDomains.slice(0, 10).map((d) => (
              <Tag key={d.domain} color="volcano">
                {d.domain} ({d.count})
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      <Space style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<ScanOutlined />}
          loading={scanning}
          onClick={handleScan}
          disabled={!accountId}
        >
          {t('privacy.tracking.scan')}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => { loadStats(); loadMessages() }}>
          {t('common.refresh')}
        </Button>
      </Space>

      <Table
        dataSource={messages}
        columns={trackerColumns}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: loadMessages,
          showTotal: (t) => `${t} messages`,
        }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PII SCANNER TAB
// ═══════════════════════════════════════════════════════════

function PiiTab({ accountId, lang, messageApi, setActiveJobId }: Readonly<{
  accountId: string | null; lang: string; messageApi: any; setActiveJobId: (id: string | null) => void
}>) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<PiiStats | null>(null)
  const [findings, setFindings] = useState<PiiFinding[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  const loadStats = useCallback(async () => {
    if (!accountId) return
    try {
      const data = await privacyApi.getPiiStats(accountId)
      setStats(data)
    } catch { /* ignore */ }
  }, [accountId])

  const loadFindings = useCallback(async (p = 1) => {
    if (!accountId) return
    setLoading(true)
    try {
      const data = await privacyApi.listPiiFindings(accountId, { page: p, limit: 20 })
      setFindings(data.items)
      setTotal(data.total)
      setPage(p)
    } catch { /* ignore */ }
    setLoading(false)
  }, [accountId])

  useEffect(() => { loadStats(); loadFindings() }, [loadStats, loadFindings])

  const handleScan = async () => {
    if (!accountId) return
    setScanning(true)
    try {
      const { jobId } = await privacyApi.scanPii(accountId)
      setActiveJobId(jobId)
    } catch {
      messageApi.error(t('privacy.pii.scanError'))
    }
    setScanning(false)
  }

  const piiColumns = [
    {
      title: t('privacy.pii.sender'),
      dataIndex: 'sender',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v || '—'}</Text>,
    },
    {
      title: t('privacy.pii.subject'),
      dataIndex: 'subject',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v || t('common.noSubject')}</Text>,
    },
    {
      title: t('privacy.pii.type'),
      dataIndex: 'pii_type',
      width: 160,
      render: (v: string) => (
        <Tag color="red">
          {PII_TYPE_LABELS[v]?.[lang as 'fr' | 'en'] ?? v}
        </Tag>
      ),
    },
    {
      title: t('privacy.pii.count'),
      dataIndex: 'count',
      width: 80,
      render: (v: number) => <Tag>{v}</Tag>,
    },
    {
      title: t('privacy.pii.preview'),
      dataIndex: 'snippet',
      width: 200,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text code style={{ fontSize: 11 }}>{v?.slice(0, 40)}{v && v.length > 40 ? '…' : ''}</Text>
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      {stats && stats.totalFindings > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message={t('privacy.pii.alertTitle')}
          description={t('privacy.pii.alertDesc', {
            count: stats.totalFindings,
            mails: stats.affectedMails,
          })}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={t('privacy.pii.totalFindings')}
              value={stats?.totalFindings ?? 0}
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={stats?.totalFindings ? { color: '#ff4d4f' } : undefined}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={t('privacy.pii.affectedMails')}
              value={stats?.affectedMails ?? 0}
              prefix={<ExclamationCircleOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('privacy.pii.byType')}</Text>
              <div style={{ marginTop: 4 }}>
                {stats?.byType?.map((bt) => (
                  <Tag key={bt.type} color="red" style={{ marginBottom: 4 }}>
                    {PII_TYPE_LABELS[bt.type]?.[lang as 'fr' | 'en'] ?? bt.type}: {bt.count}
                  </Tag>
                )) ?? <Text type="secondary">—</Text>}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<ScanOutlined />}
          loading={scanning}
          onClick={handleScan}
          disabled={!accountId}
        >
          {t('privacy.pii.scan')}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => { loadStats(); loadFindings() }}>
          {t('common.refresh')}
        </Button>
      </Space>

      <Table
        dataSource={findings}
        columns={piiColumns}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: loadFindings,
        }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// ENCRYPTION TAB
// ═══════════════════════════════════════════════════════════

function EncryptionTab({ accountId, messageApi, setActiveJobId }: Readonly<{
  accountId: string | null; messageApi: any; setActiveJobId: (id: string | null) => void
}>) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<EncryptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [passphrase, setPassphrase] = useState('')
  const [encrypting, setEncrypting] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      const data = await privacyApi.getEncryptionStatus(accountId)
      setStatus(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [accountId])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleSetup = async () => {
    if (passphrase.length < 8) {
      messageApi.error(t('privacy.encryption.minLength'))
      return
    }
    try {
      await privacyApi.setupEncryption(passphrase)
      messageApi.success(t('privacy.encryption.setupSuccess'))
      setPassphrase('')
      loadStatus()
    } catch {
      messageApi.error(t('privacy.encryption.setupError'))
    }
  }

  const handleEncrypt = async () => {
    if (!accountId || !passphrase) return
    setEncrypting(true)
    try {
      const { valid } = await privacyApi.verifyEncryption(passphrase)
      if (!valid) {
        messageApi.error(t('privacy.encryption.invalidPassphrase'))
        setEncrypting(false)
        return
      }
      const { jobId } = await privacyApi.encryptArchives(accountId, passphrase)
      setActiveJobId(jobId)
      setPassphrase('')
    } catch {
      messageApi.error(t('privacy.encryption.encryptError'))
    }
    setEncrypting(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  return (
    <div>
      <Alert
        type="info"
        showIcon
        icon={<LockOutlined />}
        message={t('privacy.encryption.infoTitle')}
        description={t('privacy.encryption.infoDesc')}
        style={{ marginBottom: 16 }}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card size="small">
            <Statistic
              title={t('privacy.encryption.totalArchives')}
              value={status?.total ?? 0}
            />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small">
            <Statistic
              title={t('privacy.encryption.encrypted')}
              value={status?.encrypted ?? 0}
              prefix={<LockOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small">
            <Statistic
              title={t('privacy.encryption.unencrypted')}
              value={status?.unencrypted ?? 0}
              prefix={status?.unencrypted ? <WarningOutlined style={{ color: '#fa8c16' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={status?.unencrypted ? { color: '#fa8c16' } : { color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('privacy.encryption.progress')}</Text>
              <Progress
                percent={status?.percentage ?? 0}
                status={status?.percentage === 100 ? 'success' : 'active'}
                style={{ marginTop: 8 }}
              />
            </div>
          </Card>
        </Col>
      </Row>

      {status?.hasEncryptionKey ? (
        <Card title={<><LockOutlined /> {t('privacy.encryption.encryptTitle')}</>} size="small">
          {status?.unencrypted === 0 ? (
            <Alert
              type="success"
              showIcon
              message={t('privacy.encryption.allEncrypted')}
              style={{ marginBottom: 12 }}
            />
          ) : (
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              {t('privacy.encryption.encryptDesc', { count: status?.unencrypted ?? 0 })}
            </Text>
          )}
          <Space>
            <Input.Password
              placeholder={t('privacy.encryption.passphrasePlaceholder')}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              style={{ width: 300 }}
            />
            <Button
              type="primary"
              danger
              icon={<LockOutlined />}
              loading={encrypting}
              onClick={handleEncrypt}
              disabled={!passphrase || status?.unencrypted === 0}
            >
              {t('privacy.encryption.encrypt')}
            </Button>
          </Space>
        </Card>
      ) : (
        <Card title={<><KeyOutlined /> {t('privacy.encryption.setupTitle')}</>} size="small">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {t('privacy.encryption.setupDesc')}
          </Text>
          <Space>
            <Input.Password
              placeholder={t('privacy.encryption.passphrasePlaceholder')}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              style={{ width: 300 }}
            />
            <Button type="primary" icon={<KeyOutlined />} onClick={handleSetup} disabled={passphrase.length < 8}>
              {t('privacy.encryption.setup')}
            </Button>
          </Space>
        </Card>
      )}
    </div>
  )
}
