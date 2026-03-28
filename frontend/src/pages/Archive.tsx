import { useEffect, useState, useCallback } from 'react'
import {
  Table, Input, Space, Button, Tag, Typography, Card, Row, Col,
  Drawer, Divider, List, Empty, Badge, message, notification, DatePicker
} from 'antd'
import {
  SearchOutlined, DownloadOutlined, PaperClipOutlined,
  ReloadOutlined, CloudDownloadOutlined, FileOutlined
} from '@ant-design/icons'
import { archiveApi, gmailApi } from '../api'
import { useAccount } from '../hooks/useAccount'
import { formatBytes, formatSender } from '../utils/format'
import dayjs from 'dayjs'

const { Text, Title } = Typography
const { Search } = Input
const { RangePicker } = DatePicker

interface ArchivedMail {
  id: string
  gmail_message_id: string
  subject: string
  sender: string
  date: string
  size_bytes: number
  has_attachments: boolean
  label_ids: string[]
  archived_at: string
  snippet: string
}

interface Attachment {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  file_path: string
}

export default function ArchivePage() {
  const { accountId } = useAccount()
  const [mails, setMails] = useState<ArchivedMail[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [sender, setSender] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  // Viewing drawer
  const [viewing, setViewing] = useState<any>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async (p = 1) => {
    if (!accountId) return
    setLoading(true)
    try {
      const params: Record<string, any> = { page: p, limit: 50 }
      if (query) params.q = query
      if (sender) params.sender = sender
      if (dateRange) {
        params.from_date = dateRange[0].toISOString()
        params.to_date = dateRange[1].toISOString()
      }
      const data = await archiveApi.listMails(accountId, params)
      setMails(data.mails)
      setTotal(data.total)
      setPage(p)
    } catch {
      messageApi.error('Erreur lors du chargement des archives')
    } finally { setLoading(false) }
  }, [accountId, query, sender, dateRange])

  useEffect(() => { load() }, [accountId])

  const openMail = async (mail: ArchivedMail) => {
    setViewLoading(true)
    try {
      const detail = await archiveApi.getMail(accountId!, mail.id)
      setViewing(detail)
    } catch {
      messageApi.error('Impossible de charger ce mail archivé')
    } finally { setViewLoading(false) }
  }

  const downloadUrl = (attachmentId: string) =>
    archiveApi.downloadAttachment(accountId!, attachmentId)

  const columns = [
    {
      title: 'Expéditeur',
      dataIndex: 'sender',
      width: 200,
      ellipsis: true,
      render: (v: string) => (
        <Text strong style={{ fontSize: 13 }}>{formatSender(v)}</Text>
      ),
    },
    {
      title: 'Sujet',
      dataIndex: 'subject',
      ellipsis: true,
      render: (v: string, row: ArchivedMail) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            {row.has_attachments && (
              <PaperClipOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
            )}
            <Text style={{ fontSize: 13 }}>{v || '(sans sujet)'}</Text>
          </Space>
          <Text type="secondary" ellipsis style={{ fontSize: 11 }}>{row.snippet}</Text>
        </Space>
      ),
    },
    {
      title: 'Taille',
      dataIndex: 'size_bytes',
      width: 90,
      sorter: (a: ArchivedMail, b: ArchivedMail) => a.size_bytes - b.size_bytes,
      render: (v: number) => <Tag color="orange">{formatBytes(v)}</Tag>,
    },
    {
      title: 'Date mail',
      dataIndex: 'date',
      width: 110,
      sorter: true,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? dayjs(v).format('DD/MM/YY') : '—'}
        </Text>
      ),
    },
    {
      title: 'Archivé le',
      dataIndex: 'archived_at',
      width: 120,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(v).format('DD/MM/YY HH:mm')}
        </Text>
      ),
    },
  ]

  return (
    <div>
      {contextHolder}
      <Title level={3} style={{ marginBottom: 16 }}>📦 Archives</Title>

      {/* Filtres */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Search
            placeholder="Recherche full-text (sujet, expéditeur…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSearch={() => load(1)}
            style={{ width: 320 }}
            allowClear
            enterButton={<SearchOutlined />}
          />
          <Input
            placeholder="Filtrer par expéditeur"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            onPressEnter={() => load(1)}
            style={{ width: 220 }}
            allowClear
            prefix={<FileOutlined />}
          />
          <RangePicker
            onChange={(dates) => setDateRange(dates as any)}
            format="DD/MM/YYYY"
            placeholder={['Date début', 'Date fin']}
          />
          <Button type="primary" onClick={() => load(1)} loading={loading}>
            <SearchOutlined /> Rechercher
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => load(1)}>
            Rafraîchir
          </Button>
          {total > 0 && (
            <Text type="secondary">{total.toLocaleString('fr-FR')} mails archivés</Text>
          )}
        </Space>
      </Card>

      {/* Table */}
      <Table
        dataSource={mails}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 800 }}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          onChange: (p) => load(p),
          showSizeChanger: false,
          showTotal: (t) => `${t.toLocaleString('fr-FR')} mails`,
        }}
        onRow={(row) => ({
          onClick: () => openMail(row),
          style: { cursor: 'pointer' },
        })}
        locale={{ emptyText: <Empty description="Aucun mail archivé" /> }}
      />

      {/* Viewer drawer */}
      <Drawer
        title={viewing?.subject || '(sans sujet)'}
        open={!!viewing}
        onClose={() => setViewing(null)}
        width={720}
        styles={{ body: { padding: 16 } }}
      >
        {viewing && (
          <>
            <Space direction="vertical" size={2} style={{ width: '100%', marginBottom: 12 }}>
              <Space><Text strong>De :</Text><Text>{viewing.sender}</Text></Space>
              <Space>
                <Text strong>Date :</Text>
                <Text type="secondary">{dayjs(viewing.date).format('DD/MM/YYYY HH:mm')}</Text>
                <Text type="secondary">·</Text>
                <Text type="secondary">{formatBytes(viewing.size_bytes)}</Text>
              </Space>
              <Space>
                <Text strong>Archivé le :</Text>
                <Text type="secondary">{dayjs(viewing.archived_at).format('DD/MM/YYYY HH:mm')}</Text>
              </Space>
            </Space>

            <Divider style={{ margin: '8px 0' }} />

            {/* Pièces jointes archivées */}
            {viewing.attachments?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text strong>
                  <PaperClipOutlined /> Pièces jointes ({viewing.attachments.length})
                </Text>
                <List
                  size="small"
                  dataSource={viewing.attachments}
                  renderItem={(att: Attachment) => (
                    <List.Item
                      actions={[
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          href={downloadUrl(att.id)}
                          download={att.filename}
                        >
                          Télécharger
                        </Button>,
                      ]}
                    >
                      <Text style={{ fontSize: 12 }}>{att.filename}</Text>
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                        {formatBytes(att.size_bytes)}
                      </Text>
                    </List.Item>
                  )}
                />
                <Divider style={{ margin: '8px 0' }} />
              </div>
            )}

            {/* Corps EML rendu */}
            {viewing.emlContent ? (
              <pre style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontSize: 13, fontFamily: 'inherit',
                background: '#fafafa', padding: 12,
                borderRadius: 4, maxHeight: 600, overflow: 'auto',
              }}>
                {viewing.emlContent}
              </pre>
            ) : (
              <Empty description="Contenu non disponible" />
            )}
          </>
        )}
      </Drawer>
    </div>
  )
}
