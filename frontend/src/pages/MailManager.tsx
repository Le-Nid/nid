import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Input, Select, Space, Button, Tag, Typography,
  message, Tooltip, Badge, Row, Col, Card, Dropdown, notification
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, FilterOutlined,
  MailOutlined, PaperClipOutlined, TagOutlined, MoreOutlined
} from '@ant-design/icons'
import { gmailApi, archiveApi } from '../api'
import { useAccount } from '../hooks/useAccount'
import { formatBytes, formatSender } from '../utils/format'
import BulkActionBar from '../components/BulkActionBar'
import MailViewer from '../components/MailViewer'
import dayjs from 'dayjs'

const { Text } = Typography
const { Search } = Input

// Gmail quick filters
const QUICK_FILTERS = [
  { label: 'Tous', value: '' },
  { label: 'Non lus', value: 'is:unread' },
  { label: 'Avec PJ', value: 'has:attachment' },
  { label: 'Gros mails (> 5 Mo)', value: 'larger:5m' },
  { label: 'Promotions', value: 'category:promotions' },
  { label: 'Réseaux sociaux', value: 'category:social' },
  { label: 'Spam', value: 'in:spam' },
  { label: 'Corbeille', value: 'in:trash' },
]

interface MailRow {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  sizeEstimate: number
  snippet: string
  labelIds: string[]
  hasAttachments: boolean
}

export default function MailManagerPage() {
  const { accountId } = useAccount()
  const [mails, setMails] = useState<MailRow[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [pageToken, setPageToken] = useState<string | null>(null)
  const [prevTokens, setPrevTokens] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const loadMails = useCallback(async (token?: string | null) => {
    if (!accountId) return
    setLoading(true)
    try {
      const fullQuery = [quickFilter, query].filter(Boolean).join(' ')
      const res = await gmailApi.listMessages(accountId, {
        q: fullQuery || undefined,
        pageToken: token ?? undefined,
        maxResults: 50,
      })

      // Enrich IDs with metadata via batchGet endpoint
      // For simplicity, we do individual gets (backend batches them)
      const enriched: MailRow[] = await Promise.all(
        (res.messages ?? []).map((m: { id: string; threadId: string }) =>
          fetch(`/api/gmail/${accountId}/messages/${m.id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          }).then((r) => r.json())
        )
      )
      setMails(enriched)
      setTotal(res.resultSizeEstimate ?? 0)
      setPageToken(res.nextPageToken ?? null)
    } catch {
      messageApi.error('Erreur lors du chargement des mails')
    } finally {
      setLoading(false) }
  }, [accountId, query, quickFilter])

  const loadLabels = useCallback(async () => {
    if (!accountId) return
    const data = await gmailApi.listLabels(accountId)
    setLabels(data)
  }, [accountId])

  useEffect(() => {
    loadMails()
    loadLabels()
    setSelected([])
    setPrevTokens([])
  }, [accountId, quickFilter])

  const handleSearch = () => {
    setPrevTokens([])
    loadMails()
  }

  const handleBulkAction = async (action: string, labelId?: string) => {
    if (!selected.length || !accountId) return

    if (action === 'archive_nas') {
      setBulkLoading(true)
      try {
        const { jobId } = await archiveApi.triggerArchive(accountId, {
          messageIds: selected,
          differential: true,
        })
        notification.success({
          message: 'Archivage lancé',
          description: `Job #${jobId} créé. Suivez la progression dans Jobs.`,
          duration: 5,
        })
        setSelected([])
      } catch {
        messageApi.error("Erreur lors du lancement de l'archivage")
      } finally { setBulkLoading(false) }
      return
    }

    setBulkLoading(true)
    try {
      const { jobId } = await gmailApi.bulkOperation(accountId, action, selected, labelId)
      notification.success({
        message: 'Opération lancée',
        description: `${selected.length} mail(s) — job #${jobId}. Voir la progression dans Jobs.`,
        duration: 5,
      })
      setSelected([])
      // Reload after a short delay to reflect changes
      setTimeout(() => loadMails(), 2000)
    } catch {
      messageApi.error("Erreur lors de l'opération")
    } finally { setBulkLoading(false) }
  }

  const nextPage = () => {
    if (!pageToken) return
    setPrevTokens((p) => [...p, pageToken])
    // loadMails with next token
    loadMails(pageToken)
  }

  const prevPage = () => {
    const tokens = [...prevTokens]
    const prev = tokens.pop()
    setPrevTokens(tokens)
    loadMails(prev ?? null)
  }

  const columns = [
    {
      title: 'Expéditeur',
      dataIndex: 'from',
      width: 200,
      ellipsis: true,
      render: (v: string, row: MailRow) => (
        <Space direction="vertical" size={0}>
          <Text
            strong={row.labelIds.includes('UNREAD')}
            ellipsis
            style={{ fontSize: 13, maxWidth: 180 }}
          >
            {formatSender(v)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Sujet',
      dataIndex: 'subject',
      ellipsis: true,
      render: (v: string, row: MailRow) => (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          <Space size={4}>
            {row.hasAttachments && (
              <Tooltip title="Avec pièce jointe">
                <PaperClipOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
              </Tooltip>
            )}
            <Text
              strong={row.labelIds.includes('UNREAD')}
              ellipsis
              style={{ fontSize: 13 }}
            >
              {v || '(sans sujet)'}
            </Text>
          </Space>
          <Text type="secondary" ellipsis style={{ fontSize: 11 }}>
            {row.snippet}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Labels',
      dataIndex: 'labelIds',
      width: 160,
      render: (ids: string[]) => (
        <Space size={2} wrap>
          {ids
            .filter((id) => !['UNREAD', 'IMPORTANT', 'STARRED'].includes(id))
            .slice(0, 3)
            .map((id) => {
              const label = labels.find((l) => l.id === id)
              return (
                <Tag key={id} style={{ fontSize: 10, padding: '0 4px' }}>
                  {label?.name ?? id}
                </Tag>
              )
            })}
        </Space>
      ),
    },
    {
      title: 'Taille',
      dataIndex: 'sizeEstimate',
      width: 80,
      sorter: (a: MailRow, b: MailRow) => a.sizeEstimate - b.sizeEstimate,
      render: (v: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(v)}</Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'date',
      width: 100,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? dayjs(v).format('DD/MM/YY') : '—'}
        </Text>
      ),
    },
    {
      title: '',
      width: 40,
      render: (_: any, row: MailRow) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'read', label: 'Lire', onClick: () => setViewingId(row.id) },
              { key: 'trash', label: 'Corbeille', onClick: () => handleBulkAction('trash') },
              { key: 'archive', label: 'Archiver Gmail', onClick: () => handleBulkAction('archive') },
              { key: 'nas', label: 'Archiver NAS', onClick: () => handleBulkAction('archive_nas') },
            ],
          }}
        >
          <Button type="text" icon={<MoreOutlined />} size="small" />
        </Dropdown>
      ),
    },
  ]

  return (
    <div>
      {contextHolder}

      <Row gutter={[0, 12]}>
        {/* Filtres */}
        <Col span={24}>
          <Card size="small">
            <Space wrap style={{ width: '100%' }}>
              <Select
                style={{ width: 200 }}
                value={quickFilter}
                onChange={setQuickFilter}
                options={QUICK_FILTERS}
                prefix={<FilterOutlined />}
                placeholder="Filtre rapide"
              />
              <Search
                placeholder="Recherche Gmail (from:, has:attachment, larger:5m…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onSearch={handleSearch}
                onPressEnter={handleSearch}
                style={{ width: 380 }}
                enterButton={<><SearchOutlined /> Rechercher</>}
                allowClear
              />
              <Button icon={<ReloadOutlined />} onClick={() => loadMails()} loading={loading}>
                Rafraîchir
              </Button>
              {total > 0 && (
                <Text type="secondary">
                  ~{total.toLocaleString('fr-FR')} résultats
                </Text>
              )}
            </Space>
          </Card>
        </Col>

        {/* Bulk action bar */}
        <Col span={24}>
          <BulkActionBar
            selected={selected}
            labels={labels}
            onBulkAction={handleBulkAction}
            loading={bulkLoading}
          />
        </Col>

        {/* Table */}
        <Col span={24}>
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
                cursor: 'pointer',
                fontWeight: row.labelIds.includes('UNREAD') ? 600 : 400,
                background: row.labelIds.includes('UNREAD') ? '#fafffe' : undefined,
              },
            })}
            locale={{ emptyText: 'Aucun mail' }}
          />

          {/* Pagination manuelle */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              size="small"
              onClick={prevPage}
              disabled={prevTokens.length === 0}
            >
              ← Page précédente
            </Button>
            <Button
              size="small"
              onClick={nextPage}
              disabled={!pageToken}
            >
              Page suivante →
            </Button>
          </div>
        </Col>
      </Row>

      {/* Mail viewer drawer */}
      <MailViewer
        accountId={accountId!}
        messageId={viewingId}
        onClose={() => setViewingId(null)}
      />
    </div>
  )
}
