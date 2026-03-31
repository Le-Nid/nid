import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Typography, Space, Tag, Card, Empty,
  Statistic, Row, Col, message, Input, Segmented,
} from 'antd'
import {
  PaperClipOutlined, CloudOutlined, DatabaseOutlined, ReloadOutlined,
  FileImageOutlined, FilePdfOutlined, FileOutlined, FileZipOutlined,
} from '@ant-design/icons'
import { attachmentsApi } from '../api'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../hooks/useAccount'
import { formatBytes } from '../utils/format'

const { Title, Text } = Typography

type ViewMode = 'archived' | 'live'

interface ArchivedAttachment {
  id: string
  filename: string
  mime_type: string | null
  size_bytes: number | bigint
  mail_subject: string | null
  mail_sender: string | null
  mail_date: string | null
}

interface LiveAttachment {
  messageId: string
  filename: string
  mimeType: string
  sizeBytes: number
  mailSubject: string
  mailSender: string
  mailDate: string
  mailSizeEstimate: number
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <FileOutlined />
  if (mimeType.startsWith('image/')) return <FileImageOutlined style={{ color: '#1677ff' }} />
  if (mimeType === 'application/pdf') return <FilePdfOutlined style={{ color: '#cf1322' }} />
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return <FileZipOutlined style={{ color: '#faad14' }} />
  return <FileOutlined />
}

export default function AttachmentsPage() {
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const [mode, setMode] = useState<ViewMode>('archived')
  const [archivedAtts, setArchivedAtts] = useState<ArchivedAttachment[]>([])
  const [liveAtts, setLiveAtts] = useState<LiveAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [totalSize, setTotalSize] = useState(0)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [messageApi, contextHolder] = message.useMessage()

  const loadArchived = useCallback(async (p = 1, q = '') => {
    if (!accountId) return
    setLoading(true)
    try {
      const data = await attachmentsApi.listArchived(accountId, {
        page: p,
        limit: 50,
        sort: 'size',
        order: 'desc',
        ...(q ? { q } : {}),
      })
      setArchivedAtts(data.attachments)
      setTotal(data.total)
      setTotalSize(data.totalSizeBytes)
    } catch {
      messageApi.error(t('attachments.loadError'))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  const loadLive = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      const data = await attachmentsApi.listLive(accountId, { maxResults: 200 })
      setLiveAtts(data.attachments)
      setTotalSize(data.totalSizeBytes)
      setTotal(data.attachments.length)
    } catch {
      messageApi.error(t('attachments.scanError'))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (mode === 'archived') loadArchived(1, search)
    else loadLive()
  }, [mode, accountId])

  const handleSearch = (q: string) => {
    setSearch(q)
    setPage(1)
    if (mode === 'archived') loadArchived(1, q)
  }

  const archivedColumns = [
    {
      title: t('attachments.filename'),
      key: 'filename',
      render: (_: any, row: ArchivedAttachment) => (
        <Space>
          {getFileIcon(row.mime_type)}
          <Text style={{ fontSize: 13 }}>{row.filename}</Text>
        </Space>
      ),
    },
    {
      title: t('attachments.size'),
      key: 'size_bytes',
      width: 110,
      sorter: true,
      render: (_: any, row: ArchivedAttachment) => formatBytes(Number(row.size_bytes)),
    },
    {
      title: t('attachments.mail'),
      key: 'mail',
      render: (_: any, row: ArchivedAttachment) => (
        <Space orientation="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{row.mail_subject || t('common.noSubject')}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.mail_sender}</Text>
        </Space>
      ),
    },
    {
      title: t('attachments.date'),
      key: 'date',
      width: 120,
      render: (_: any, row: ArchivedAttachment) => {
        try { return row.mail_date ? new Date(row.mail_date).toLocaleDateString() : '-' } catch { return '-' }
      },
    },
    {
      title: t('attachments.type'),
      key: 'type',
      width: 140,
      render: (_: any, row: ArchivedAttachment) => (
        <Tag style={{ fontSize: 10 }}>{row.mime_type || t('common.noData')}</Tag>
      ),
    },
  ]

  const liveColumns = [
    {
      title: t('attachments.filename'),
      key: 'filename',
      render: (_: any, row: LiveAttachment) => (
        <Space>
          {getFileIcon(row.mimeType)}
          <Text style={{ fontSize: 13 }}>{row.filename}</Text>
        </Space>
      ),
    },
    {
      title: t('attachments.size'),
      dataIndex: 'sizeBytes',
      width: 110,
      sorter: (a: LiveAttachment, b: LiveAttachment) => a.sizeBytes - b.sizeBytes,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => formatBytes(v),
    },
    {
      title: t('attachments.mail'),
      key: 'mail',
      render: (_: any, row: LiveAttachment) => (
        <Space orientation="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{row.mailSubject || t('common.noSubject')}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.mailSender}</Text>
        </Space>
      ),
    },
    {
      title: t('attachments.date'),
      key: 'date',
      width: 120,
      render: (_: any, row: LiveAttachment) => {
        try { return new Date(row.mailDate).toLocaleDateString() } catch { return '-' }
      },
    },
    {
      title: t('attachments.type'),
      key: 'type',
      width: 140,
      render: (_: any, row: LiveAttachment) => <Tag style={{ fontSize: 10 }}>{row.mimeType}</Tag>,
    },
  ]

  return (
    <div>
      {contextHolder}

      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={3} style={{ margin: 0 }}>{t('attachments.title')}</Title>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as ViewMode)}
          options={[
            { label: <><DatabaseOutlined /> {t('attachments.archived')}</>, value: 'archived' },
            { label: <><CloudOutlined /> {t('attachments.live')}</>, value: 'live' },
          ]}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => mode === 'archived' ? loadArchived(page, search) : loadLive()}
          loading={loading}
        >
          {t('attachments.reload')}
        </Button>
      </Space>

      {!accountId ? (
        <Empty description={t('attachments.noAccount')} />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title={t('attachments.totalAttachments')} value={total} prefix={<PaperClipOutlined />} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title={t('attachments.totalSize')} value={formatBytes(totalSize)} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title={t('attachments.source')}
                  value={mode === 'archived' ? t('attachments.sourceArchived') : t('attachments.sourceLive')}
                />
              </Card>
            </Col>
          </Row>

          {mode === 'archived' && (
            <Input.Search
              placeholder={t('attachments.searchPlaceholder')}
              style={{ marginBottom: 12, maxWidth: 400 }}
              onSearch={handleSearch}
              allowClear
            />
          )}

          <Table
            dataSource={mode === 'archived' ? archivedAtts : liveAtts as any[]}
            columns={(mode === 'archived' ? archivedColumns : liveColumns) as any}
            rowKey={mode === 'archived' ? 'id' : (r: any) => `${r.messageId}-${r.filename}`}
            loading={loading}
            size="small"
            pagination={mode === 'archived' ? {
              current: page,
              pageSize: 50,
              total,
              onChange: (p) => { setPage(p); loadArchived(p, search) },
              showTotal: (t) => `${t} pièces jointes`,
            } : { pageSize: 50, showTotal: (t) => `${t} pièces jointes` }}
            locale={{ emptyText: <Empty description={t('attachments.noAttachment')} /> }}
          />
        </>
      )}
    </div>
  )
}
