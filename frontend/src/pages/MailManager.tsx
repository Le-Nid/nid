import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Space, Button, Tag, Typography,
  message, Tooltip, Card, Dropdown, notification, Spin
} from 'antd'
import {
  ReloadOutlined, FilterOutlined,
  MailOutlined, PaperClipOutlined, MoreOutlined
} from '@ant-design/icons'
import { Select } from 'antd'
import { gmailApi, archiveApi } from '../api'
import { useAccount } from '../hooks/useAccount'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { formatBytes, formatSender } from '../utils/format'
import BulkActionBar from '../components/BulkActionBar'
import MailViewer from '../components/MailViewer'
import GmailSearchInput from '../components/GmailSearchInput'
import JobProgressModal from '../components/JobProgressModal'
import dayjs from 'dayjs'

const { Text } = Typography

const QUICK_FILTERS = [
  { label: 'Tous',                value: '' },
  { label: 'Non lus',             value: 'is:unread' },
  { label: 'Avec PJ',             value: 'has:attachment' },
  { label: 'Gros (> 5 Mo)',       value: 'larger:5m' },
  { label: 'Promotions',          value: 'category:promotions' },
  { label: 'Réseaux sociaux',     value: 'category:social' },
  { label: 'Spam',                value: 'in:spam' },
  { label: 'Corbeille',           value: 'in:trash' },
  { label: '> 1 an',              value: 'older_than:1y' },
]

interface MailRow {
  id: string; threadId: string; subject: string; from: string
  date: string; sizeEstimate: number; snippet: string
  labelIds: string[]; hasAttachments: boolean
}

export default function MailManagerPage() {
  const { accountId } = useAccount()

  const [mails, setMails]       = useState<MailRow[]>([])
  const [labels, setLabels]     = useState<any[]>([])
  const [loading, setLoading]   = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery]       = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [pageToken, setPageToken]     = useState<string | null>(null)
  const [hasMore, setHasMore]         = useState(false)
  const [total, setTotal]             = useState(0)
  const [viewingId, setViewingId]     = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const [messageApi, contextHolder] = message.useMessage()

  // ─── Chargement initial ───────────────────────────────────
  const loadFresh = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    setMails([])
    setSelected([])
    setPageToken(null)
    try {
      const fullQuery = [quickFilter, query].filter(Boolean).join(' ')
      const res = await gmailApi.listMessages(accountId, {
        q: fullQuery || undefined,
        maxResults: 50,
      })

      const ids: string[] = (res.messages ?? []).map((m: any) => m.id)
      const enriched = await fetchMeta(accountId, ids)

      setMails(enriched)
      setTotal(res.resultSizeEstimate ?? 0)
      setPageToken(res.nextPageToken ?? null)
      setHasMore(!!res.nextPageToken)
    } catch {
      messageApi.error('Erreur lors du chargement des mails')
    } finally { setLoading(false) }
  }, [accountId, query, quickFilter])

  // ─── Charger la page suivante (infinite scroll) ───────────
  const loadMore = useCallback(async () => {
    if (!accountId || !pageToken || loadingMore) return
    setLoadingMore(true)
    try {
      const fullQuery = [quickFilter, query].filter(Boolean).join(' ')
      const res = await gmailApi.listMessages(accountId, {
        q:         fullQuery || undefined,
        maxResults: 50,
        pageToken,
      })

      const ids: string[] = (res.messages ?? []).map((m: any) => m.id)
      const enriched = await fetchMeta(accountId, ids)

      setMails((prev) => [...prev, ...enriched])
      setPageToken(res.nextPageToken ?? null)
      setHasMore(!!res.nextPageToken)
    } catch {
      messageApi.error('Erreur lors du chargement')
    } finally { setLoadingMore(false) }
  }, [accountId, pageToken, query, quickFilter, loadingMore])

  // Sentinel div en bas de liste → IntersectionObserver
  const sentinelRef = useInfiniteScroll({ onLoadMore: loadMore, hasMore, loading: loadingMore })

  const loadLabels = useCallback(async () => {
    if (!accountId) return
    const data = await gmailApi.listLabels(accountId)
    setLabels(data)
  }, [accountId])

  useEffect(() => {
    loadFresh()
    loadLabels()
  }, [accountId, quickFilter])

  // ─── Fetch métadonnées en parallèle ──────────────────────
  async function fetchMeta(acctId: string, ids: string[]): Promise<MailRow[]> {
    const token = localStorage.getItem('token')
    return Promise.all(
      ids.map((id) =>
        fetch(`/api/gmail/${acctId}/messages/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json())
      )
    )
  }

  // ─── Bulk actions ─────────────────────────────────────────
  const handleBulkAction = async (action: string, labelId?: string) => {
    if (!selected.length || !accountId) return

    if (action === 'archive_nas') {
      setBulkLoading(true)
      try {
        const { jobId } = await archiveApi.triggerArchive(accountId, {
          messageIds: selected, differential: true,
        })
        setActiveJobId(jobId)
        notification.success({
          message: 'Archivage lancé',
          description: `Job créé — suivi temps réel disponible.`,
        })
        setSelected([])
      } finally { setBulkLoading(false) }
      return
    }

    setBulkLoading(true)
    try {
      const { jobId } = await gmailApi.bulkOperation(accountId, action, selected, labelId)
      setActiveJobId(jobId)
      notification.success({
        message:     'Opération lancée',
        description: `${selected.length} mail(s) — suivi dans Jobs.`,
      })
      setSelected([])
      setTimeout(loadFresh, 3000)
    } catch {
      messageApi.error("Erreur lors de l'opération")
    } finally { setBulkLoading(false) }
  }

  // ─── Colonnes ─────────────────────────────────────────────
  const columns = [
    {
      title: 'Expéditeur', dataIndex: 'from', width: 195, ellipsis: true,
      render: (v: string, row: MailRow) => (
        <Text
          strong={row.labelIds.includes('UNREAD')}
          ellipsis style={{ fontSize: 13, maxWidth: 180, display: 'block' }}
        >
          {formatSender(v)}
        </Text>
      ),
    },
    {
      title: 'Sujet', dataIndex: 'subject', ellipsis: true,
      render: (v: string, row: MailRow) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            {row.hasAttachments && (
              <PaperClipOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
            )}
            <Text strong={row.labelIds.includes('UNREAD')} style={{ fontSize: 13 }}>
              {v || '(sans sujet)'}
            </Text>
          </Space>
          <Text type="secondary" ellipsis style={{ fontSize: 11 }}>{row.snippet}</Text>
        </Space>
      ),
    },
    {
      title: 'Labels', dataIndex: 'labelIds', width: 160,
      render: (ids: string[]) => (
        <Space size={2} wrap>
          {ids
            .filter((id) => !['UNREAD', 'IMPORTANT', 'STARRED'].includes(id))
            .slice(0, 3)
            .map((id) => {
              const label = labels.find((l) => l.id === id)
              return <Tag key={id} style={{ fontSize: 10, padding: '0 4px' }}>{label?.name ?? id}</Tag>
            })}
        </Space>
      ),
    },
    {
      title: 'Taille', dataIndex: 'sizeEstimate', width: 80,
      sorter: (a: MailRow, b: MailRow) => a.sizeEstimate - b.sizeEstimate,
      render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(v)}</Text>,
    },
    {
      title: 'Date', dataIndex: 'date', width: 95,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? dayjs(v).format('DD/MM/YY') : '—'}
        </Text>
      ),
    },
    {
      title: '', width: 40,
      render: (_: any, row: MailRow) => (
        <Dropdown trigger={['click']} menu={{
          items: [
            { key: 'read',    label: 'Lire',           onClick: () => setViewingId(row.id) },
            { key: 'trash',   label: 'Corbeille',      onClick: () => handleBulkAction('trash') },
            { key: 'archive', label: 'Archiver Gmail', onClick: () => handleBulkAction('archive') },
            { key: 'nas',     label: 'Archiver NAS',   onClick: () => handleBulkAction('archive_nas') },
          ],
        }}>
          <Button type="text" icon={<MoreOutlined />} size="small" />
        </Dropdown>
      ),
    },
  ]

  return (
    <div>
      {contextHolder}

      {/* Filtres */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            style={{ width: 190 }}
            value={quickFilter}
            onChange={(v) => { setQuickFilter(v); }}
            options={QUICK_FILTERS}
            prefix={<FilterOutlined />}
          />
          <GmailSearchInput
            value={query}
            onChange={setQuery}
            onSearch={loadFresh}
            style={{ width: 400 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadFresh} loading={loading} />
          {total > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ~{total.toLocaleString('fr-FR')} résultats · {mails.length} chargés
            </Text>
          )}
        </Space>
      </Card>

      {/* Bulk bar */}
      <BulkActionBar
        selected={selected}
        labels={labels}
        onBulkAction={handleBulkAction}
        loading={bulkLoading}
      />

      {/* Table */}
      <Table
        dataSource={mails}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ x: 800 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
        }}
        onRow={(row) => ({
          onClick: () => setViewingId(row.id),
          style: {
            cursor:     'pointer',
            fontWeight: row.labelIds.includes('UNREAD') ? 600 : 400,
          },
        })}
        locale={{ emptyText: 'Aucun mail' }}
      />

      {/* Sentinel infinite scroll */}
      <div ref={sentinelRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {loadingMore && <Spin size="small" />}
        {!hasMore && mails.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>— Tous les mails chargés —</Text>
        )}
      </div>

      {/* Mail viewer */}
      <MailViewer
        accountId={accountId!}
        messageId={viewingId}
        onClose={() => setViewingId(null)}
      />

      {/* Job progress SSE */}
      <JobProgressModal
        jobId={activeJobId}
        onClose={() => setActiveJobId(null)}
      />
    </div>
  )
}
