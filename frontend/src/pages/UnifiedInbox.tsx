import { useState } from 'react'
import {
  Table, Space, Button, Tag, Typography, Card, Select, Empty, Spin,
} from 'antd'
import { RefreshCw, Paperclip, Filter, Merge } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUnifiedMessages } from '../hooks/queries'
import { useAuthStore } from '../store/auth.store'
import { formatBytes, formatSender } from '../utils/format'
import GmailSearchInput from '../components/GmailSearchInput'
import MailViewer from '../components/MailViewer'
import dayjs from 'dayjs'

const { Text, Title } = Typography

interface UnifiedMailRow {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  sizeEstimate: number
  snippet: string
  labelIds: string[]
  hasAttachments: boolean
  accountId: string
  accountEmail: string
}

// Assign a stable color to each account
const ACCOUNT_COLORS = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'gold', 'lime']

export default function UnifiedInboxPage() {
  const { t } = useTranslation()
  const gmailAccounts = useAuthStore((s) => s.gmailAccounts)
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAccount, setFilterAccount] = useState<string | undefined>(undefined)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewingAccountId, setViewingAccountId] = useState<string | null>(null)

  const { data, isLoading, refetch } = useUnifiedMessages(
    { q: searchQuery || undefined, maxResults: 20 },
    gmailAccounts.length > 0,
  )

  const messages: UnifiedMailRow[] = data?.messages ?? []
  const filteredMessages = filterAccount
    ? messages.filter((m) => m.accountId === filterAccount)
    : messages

  const accountColorMap = new Map<string, string>()
  ;(data?.accounts ?? gmailAccounts).forEach((a: any, i: number) => {
    accountColorMap.set(a.id, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length])
  })

  const handleSearch = () => {
    setSearchQuery(query)
  }

  const openMail = (row: UnifiedMailRow) => {
    setViewingId(row.id)
    setViewingAccountId(row.accountId)
  }

  const columns = [
    {
      title: t('unified.account'),
      dataIndex: 'accountEmail',
      width: 160,
      ellipsis: true,
      render: (v: string, row: UnifiedMailRow) => (
        <Tag color={accountColorMap.get(row.accountId) ?? 'default'} style={{ fontSize: 11 }}>
          {v?.split('@')[0]}
        </Tag>
      ),
    },
    {
      title: t('unified.sender'),
      dataIndex: 'from',
      width: 195,
      ellipsis: true,
      render: (v: string, row: UnifiedMailRow) => (
        <Text
          strong={row.labelIds.includes('UNREAD')}
          ellipsis
          style={{ fontSize: 13, maxWidth: 180, display: 'block' }}
        >
          {formatSender(v)}
        </Text>
      ),
    },
    {
      title: t('unified.subject'),
      dataIndex: 'subject',
      ellipsis: true,
      render: (v: string, row: UnifiedMailRow) => (
        <Space size={4}>
          {row.hasAttachments && <Paperclip size={14} style={{ color: '#8c8c8c', fontSize: 12 }} />}
          <Text strong={row.labelIds.includes('UNREAD')} style={{ fontSize: 13 }}>
            {v || t('common.noSubject')}
          </Text>
        </Space>
      ),
    },
    {
      title: t('unified.size'),
      dataIndex: 'sizeEstimate',
      width: 80,
      sorter: (a: UnifiedMailRow, b: UnifiedMailRow) => a.sizeEstimate - b.sizeEstimate,
      render: (v: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(v)}</Text>
      ),
    },
    {
      title: t('unified.date'),
      dataIndex: 'date',
      width: 95,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? dayjs(v).format('DD/MM/YY') : '—'}
        </Text>
      ),
    },
  ]

  if (gmailAccounts.length < 2) {
    return (
      <div>
        <Title level={3}><Merge size={20} style={{ marginRight: 8 }} />{t('unified.title')}</Title>
        <Empty description={t('unified.needMultipleAccounts')} />
      </div>
    )
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}><Merge size={20} style={{ marginRight: 8 }} />{t('unified.title')}</Title>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            allowClear
            placeholder={t('unified.allAccounts')}
            value={filterAccount}
            onChange={setFilterAccount}
            style={{ width: 220 }}
            options={gmailAccounts.map((a, i) => ({
              value: a.id,
              label: (
                <Space>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8,
                    borderRadius: '50%', background: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
                  }} />
                  {a.email}
                </Space>
              ),
            }))}
            prefix={<Filter size={14} />}
          />
          <GmailSearchInput
            value={query}
            onChange={setQuery}
            onSearch={handleSearch}
            style={{ width: 400 }}
          />
          <Button
            icon={<RefreshCw size={14} />}
            onClick={() => refetch()}
            loading={isLoading}
          />
          {filteredMessages.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {filteredMessages.length} {t('unified.results')}
            </Text>
          )}
        </Space>
      </Card>

      {/* Table */}
      <Table
        dataSource={filteredMessages}
        columns={columns}
        rowKey={(row) => `${row.accountId}-${row.id}`}
        loading={isLoading}
        size="small"
        pagination={false}
        scroll={{ x: 800 }}
        onRow={(row) => ({
          onClick: () => openMail(row),
          style: {
            cursor: 'pointer',
            fontWeight: row.labelIds.includes('UNREAD') ? 600 : 400,
          },
        })}
        locale={{ emptyText: <Empty description={t('unified.noMail')} /> }}
      />

      {isLoading && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Spin />
        </div>
      )}

      <MailViewer
        accountId={viewingAccountId ?? ''}
        messageId={viewingId}
        onClose={() => { setViewingId(null); setViewingAccountId(null) }}
      />
    </div>
  )
}
