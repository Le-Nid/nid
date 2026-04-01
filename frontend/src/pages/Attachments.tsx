import { useState } from 'react'
import {
  Table, Button, Typography, Space, Tag, Card, Empty,
  Statistic, Row, Col, message, Input, Segmented,
} from 'antd'
import {
  PaperClipOutlined, CloudOutlined, DatabaseOutlined, ReloadOutlined,
  FileImageOutlined, FilePdfOutlined, FileOutlined, FileZipOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../hooks/useAccount'
import { formatBytes } from '../utils/format'
import { useArchivedAttachments, useLiveAttachments } from '../hooks/queries'

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
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [, contextHolder] = message.useMessage()

  const archivedParams = { page, limit: 50, sort: 'size', order: 'desc', ...(search ? { q: search } : {}) }
  const archivedQuery = useArchivedAttachments(mode === 'archived' ? accountId : null, archivedParams)
  const liveQuery = useLiveAttachments(mode === 'live' ? accountId : null, { maxResults: 200 })

  const archivedAtts = archivedQuery.data?.attachments ?? []
  const liveAtts = liveQuery.data?.attachments ?? []
  const loading = mode === 'archived' ? archivedQuery.isLoading : liveQuery.isLoading
  const total = mode === 'archived' ? (archivedQuery.data?.total ?? 0) : liveAtts.length
  const totalSize = mode === 'archived' ? (archivedQuery.data?.totalSizeBytes ?? 0) : (liveQuery.data?.totalSizeBytes ?? 0)

  const handleSearch = (q: string) => {
    setSearch(q)
    setPage(1)
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
          onClick={() => mode === 'archived' ? archivedQuery.refetch() : liveQuery.refetch()}
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
              onChange: (p) => { setPage(p) },
              showTotal: (t) => `${t} pièces jointes`,
            } : { pageSize: 50, showTotal: (t) => `${t} pièces jointes` }}
            locale={{ emptyText: <Empty description={t('attachments.noAttachment')} /> }}
          />
        </>
      )}
    </div>
  )
}
