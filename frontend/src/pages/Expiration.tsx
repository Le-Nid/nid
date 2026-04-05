import { useState } from 'react'
import {
  Typography, Table, Button, Space, Tag, Statistic, Row, Col, Card,
  Modal, InputNumber, Select, message, Popconfirm, Tooltip,
} from 'antd'
import { Clock, Trash2, Plus, Scan, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useAccount } from '../hooks/useAccount'
import {
  useExpirations, useExpirationStats, useDeleteExpiration,
  useCreateExpiration, useDetectExpirations, useCreateExpirationBatch,
} from '../hooks/queries'
import { gmailApi } from '../api'

dayjs.extend(relativeTime)

const { Title, Text } = Typography

const CATEGORY_COLORS: Record<string, string> = {
  otp: 'red',
  delivery: 'blue',
  promo: 'orange',
  manual: 'default',
}

const CATEGORY_DEFAULTS: Record<string, number> = {
  otp: 1,
  delivery: 14,
  promo: 7,
  manual: 7,
}

export default function ExpirationPage() {
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const { data: expirations = [], isLoading } = useExpirations(accountId)
  const { data: stats } = useExpirationStats(accountId)
  const deleteMutation = useDeleteExpiration(accountId!)
  const createMutation = useCreateExpiration(accountId!)
  const detectMutation = useDetectExpirations(accountId!)
  const batchMutation = useCreateExpirationBatch(accountId!)
  const [messageApi, contextHolder] = message.useMessage()

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState({ messageId: '', subject: '', sender: '', days: 7, category: 'manual' })
  const [detectModalOpen, setDetectModalOpen] = useState(false)
  const [detected, setDetected] = useState<any[]>([])
  const [detecting, setDetecting] = useState(false)
  const [selectedDetected, setSelectedDetected] = useState<string[]>([])

  if (!accountId) {
    return <Text type="secondary">{t('common.selectAccount')}</Text>
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id)
      messageApi.success(t('expiration.deleteSuccess'))
    } catch {
      messageApi.error(t('expiration.deleteError'))
    }
  }

  const handleAdd = async () => {
    if (!addForm.messageId) return
    try {
      await createMutation.mutateAsync({
        gmailMessageId: addForm.messageId,
        subject: addForm.subject || undefined,
        sender: addForm.sender || undefined,
        expiresInDays: addForm.days,
        category: addForm.category,
      })
      messageApi.success(t('expiration.createSuccess'))
      setAddModalOpen(false)
      setAddForm({ messageId: '', subject: '', sender: '', days: 7, category: 'manual' })
    } catch {
      messageApi.error(t('expiration.createError'))
    }
  }

  const handleDetect = async () => {
    setDetecting(true)
    try {
      // Fetch recent messages for heuristic detection
      const res = await gmailApi.listMessages(accountId, { maxResults: 100 })
      const messages = res.messages ?? []
      if (messages.length === 0) {
        messageApi.info(t('expiration.noMessages'))
        setDetecting(false)
        return
      }

      // Batch get metadata
      const ids = messages.map((m: any) => m.id)
      const details = await gmailApi.batchGetMessages(accountId, ids)

      const result = await detectMutation.mutateAsync(
        details.map((d: any) => ({
          gmailMessageId: d.id,
          subject: d.subject,
          sender: d.from,
        }))
      )

      if (result.length === 0) {
        messageApi.info(t('expiration.noneDetected'))
      } else {
        setDetected(result)
        setSelectedDetected(result.map((r: any) => r.gmailMessageId))
        setDetectModalOpen(true)
      }
    } catch {
      messageApi.error(t('expiration.detectError'))
    } finally {
      setDetecting(false)
    }
  }

  const handleApplyDetected = async () => {
    const items = detected
      .filter((d: any) => selectedDetected.includes(d.gmailMessageId))
      .map((d: any) => ({
        gmailMessageId: d.gmailMessageId,
        subject: d.subject,
        sender: d.sender,
        expiresInDays: d.suggestedDays,
        category: d.category,
      }))

    if (items.length === 0) return

    try {
      await batchMutation.mutateAsync(items)
      messageApi.success(t('expiration.batchSuccess', { count: items.length }))
      setDetectModalOpen(false)
      setDetected([])
    } catch {
      messageApi.error(t('expiration.createError'))
    }
  }

  const columns = [
    {
      title: t('expiration.subject'),
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
      render: (text: string) => text || <Text type="secondary">{t('common.noSubject')}</Text>,
    },
    {
      title: t('expiration.sender'),
      dataIndex: 'sender',
      key: 'sender',
      ellipsis: true,
      width: 200,
    },
    {
      title: t('expiration.category'),
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (cat: string) => (
        <Tag color={CATEGORY_COLORS[cat] ?? 'default'}>
          {t(`expiration.cat_${cat}`)}
        </Tag>
      ),
    },
    {
      title: t('expiration.expiresAt'),
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 200,
      sorter: (a: any, b: any) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime(),
      render: (date: string) => {
        const d = dayjs(date)
        const isExpired = d.isBefore(dayjs())
        const isSoon = d.isBefore(dayjs().add(1, 'day'))
        return (
          <Tooltip title={d.format('YYYY-MM-DD HH:mm')}>
            <Text type={isExpired ? 'danger' : isSoon ? 'warning' : undefined}>
              {d.fromNow()}
            </Text>
          </Tooltip>
        )
      },
    },
    {
      title: t('expiration.status'),
      key: 'status',
      width: 120,
      render: (_: any, record: any) =>
        record.is_deleted
          ? <Tag color="red">{t('expiration.deleted')}</Tag>
          : dayjs(record.expires_at).isBefore(dayjs())
            ? <Tag color="orange">{t('expiration.expired')}</Tag>
            : <Tag color="green">{t('expiration.active')}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 80,
      render: (_: any, record: any) =>
        !record.is_deleted && (
          <Popconfirm
            title={t('expiration.confirmDelete')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="text" danger icon={<Trash2 size={14} />} size="small" />
          </Popconfirm>
        ),
    },
  ]

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          <Clock size={20} style={{ marginRight: 8 }} />
          {t('expiration.title')}
        </Title>
        <Text type="secondary">{t('expiration.description')}</Text>

        {stats && (
          <Row gutter={16}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title={t('expiration.statPending')} value={stats.pending} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title={t('expiration.statExpiringSoon')}
                  value={stats.expiringSoon}
                  styles={stats.expiringSoon > 0 ? { content: { color: '#faad14' } } : undefined}
                  prefix={stats.expiringSoon > 0 ? <AlertCircle size={14} /> : undefined}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title={t('expiration.statDeleted')} value={stats.deleted} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title={t('expiration.statTotal')} value={stats.total} />
              </Card>
            </Col>
          </Row>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button
            type="primary"
            icon={<Scan size={14} />}
            onClick={handleDetect}
            loading={detecting}
          >
            {t('expiration.detect')}
          </Button>
          <Button
            icon={<Plus size={14} />}
            onClick={() => setAddModalOpen(true)}
          >
            {t('expiration.addManual')}
          </Button>
        </div>

        <Table
          dataSource={expirations}
          columns={columns}
          loading={isLoading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
        />
      </Space>

      {/* Add expiration modal */}
      <Modal
        title={t('expiration.addTitle')}
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => setAddModalOpen(false)}
        confirmLoading={createMutation.isPending}
        okText={t('common.save')}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>{t('expiration.messageId')}</Text>
            <input
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              value={addForm.messageId}
              onChange={(e) => setAddForm((f) => ({ ...f, messageId: e.target.value }))}
              placeholder="Gmail message ID"
            />
          </div>
          <div>
            <Text strong>{t('expiration.categoryLabel')}</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={addForm.category}
              onChange={(v) => setAddForm((f) => ({ ...f, category: v, days: CATEGORY_DEFAULTS[v] ?? 7 }))}
              options={[
                { value: 'manual', label: t('expiration.cat_manual') },
                { value: 'otp', label: t('expiration.cat_otp') },
                { value: 'delivery', label: t('expiration.cat_delivery') },
                { value: 'promo', label: t('expiration.cat_promo') },
              ]}
            />
          </div>
          <div>
            <Text strong>{t('expiration.expiresInDays')}</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 4 }}
              min={1}
              max={365}
              value={addForm.days}
              onChange={(v) => setAddForm((f) => ({ ...f, days: v ?? 7 }))}
            />
          </div>
        </Space>
      </Modal>

      {/* Detected expirations modal */}
      <Modal
        title={t('expiration.detectTitle')}
        open={detectModalOpen}
        onOk={handleApplyDetected}
        onCancel={() => setDetectModalOpen(false)}
        confirmLoading={batchMutation.isPending}
        okText={t('expiration.applySelected')}
        width={700}
      >
        <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
          {t('expiration.detectInfo', { count: detected.length })}
        </Text>
        <Table
          dataSource={detected}
          rowKey="gmailMessageId"
          size="small"
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedDetected,
            onChange: (keys) => setSelectedDetected(keys as string[]),
          }}
          columns={[
            {
              title: t('expiration.subject'),
              dataIndex: 'subject',
              ellipsis: true,
            },
            {
              title: t('expiration.category'),
              dataIndex: 'category',
              width: 120,
              render: (cat: string) => (
                <Tag color={CATEGORY_COLORS[cat] ?? 'default'}>
                  {t(`expiration.cat_${cat}`)}
                </Tag>
              ),
            },
            {
              title: t('expiration.suggestedDays'),
              dataIndex: 'suggestedDays',
              width: 120,
              render: (d: number) => t('expiration.nDays', { count: d }),
            },
          ]}
        />
      </Modal>
    </>
  )
}
