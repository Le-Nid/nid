import { useState } from 'react'
import {
  Typography, Table, Button, Space, message, Popconfirm,
  Tooltip, Modal, InputNumber, Select, Card,
} from 'antd'
import { Share2, Trash2, Copy, Link } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useShares, useCreateShare, useRevokeShare } from '../hooks/queries'

dayjs.extend(relativeTime)

const { Title, Text } = Typography

export default function SharingPage() {
  const { t } = useTranslation()
  const { data: shares = [], isLoading } = useShares()
  const createMutation = useCreateShare()
  const revokeMutation = useRevokeShare()
  const [messageApi, contextHolder] = message.useMessage()

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [mailId, setMailId] = useState('')
  const [hours, setHours] = useState(24)
  const [maxAccess, setMaxAccess] = useState<number | undefined>(undefined)
  const [lastCreatedLink, setLastCreatedLink] = useState<string | null>(null)

  const handleRevoke = async (id: string) => {
    try {
      await revokeMutation.mutateAsync(id)
      messageApi.success(t('sharing.revokeSuccess'))
    } catch {
      messageApi.error(t('sharing.revokeError'))
    }
  }

  const handleCreate = async () => {
    if (!mailId) return
    try {
      const share = await createMutation.mutateAsync({
        archivedMailId: mailId,
        expiresInHours: hours,
        maxAccess,
      })
      const link = `${window.location.origin}/shared/${share.token}`
      setLastCreatedLink(link)
      messageApi.success(t('sharing.createSuccess'))
      setCreateModalOpen(false)
      setMailId('')
    } catch {
      messageApi.error(t('sharing.createError'))
    }
  }

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/shared/${token}`
    navigator.clipboard.writeText(link).then(() => {
      messageApi.success(t('sharing.linkCopied'))
    })
  }

  const columns = [
    {
      title: t('sharing.subject'),
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
      render: (text: string) => text || <Text type="secondary">{t('common.noSubject')}</Text>,
    },
    {
      title: t('sharing.sender'),
      dataIndex: 'sender',
      key: 'sender',
      ellipsis: true,
      width: 200,
    },
    {
      title: t('sharing.expiresAt'),
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 180,
      render: (date: string) => {
        const d = dayjs(date)
        const isExpired = d.isBefore(dayjs())
        return (
          <Tooltip title={d.format('YYYY-MM-DD HH:mm')}>
            <Text type={isExpired ? 'danger' : undefined}>
              {isExpired ? t('sharing.expired') : d.fromNow()}
            </Text>
          </Tooltip>
        )
      },
    },
    {
      title: t('sharing.accessCount'),
      key: 'access',
      width: 120,
      render: (_: any, record: any) => (
        <Text>
          {record.access_count}
          {record.max_access ? ` / ${record.max_access}` : ''}
        </Text>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title={t('sharing.copyLink')}>
            <Button
              type="text"
              icon={<Copy size={14} />}
              size="small"
              onClick={() => copyLink(record.token)}
            />
          </Tooltip>
          <Popconfirm
            title={t('sharing.confirmRevoke')}
            onConfirm={() => handleRevoke(record.id)}
          >
            <Button type="text" danger icon={<Trash2 size={14} />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          <Share2 size={20} style={{ marginRight: 8 }} />
          {t('sharing.title')}
        </Title>
        <Text type="secondary">{t('sharing.description')}</Text>

        <Button
          type="primary"
          icon={<Share2 size={14} />}
          onClick={() => setCreateModalOpen(true)}
        >
          {t('sharing.createShare')}
        </Button>

        {lastCreatedLink && (
          <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Space>
              <Link size={14} />
              <Text copyable>{lastCreatedLink}</Text>
            </Space>
          </Card>
        )}

        <Table
          dataSource={shares}
          columns={columns}
          loading={isLoading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
          locale={{ emptyText: t('sharing.noShares') }}
        />
      </Space>

      <Modal
        title={t('sharing.createTitle')}
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={createMutation.isPending}
        okText={t('common.save')}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>{t('sharing.archivedMailId')}</Text>
            <input
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              value={mailId}
              onChange={(e) => setMailId(e.target.value)}
              placeholder="UUID"
            />
          </div>
          <div>
            <Text strong>{t('sharing.expiresInHours')}</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={hours}
              onChange={setHours}
              options={[
                { value: 1, label: t('sharing.hour1') },
                { value: 6, label: t('sharing.hours6') },
                { value: 24, label: t('sharing.hours24') },
                { value: 72, label: t('sharing.hours72') },
                { value: 168, label: t('sharing.hours168') },
                { value: 720, label: t('sharing.hours720') },
              ]}
            />
          </div>
          <div>
            <Text strong>{t('sharing.maxAccessLabel')}</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 4 }}
              min={1}
              max={1000}
              value={maxAccess}
              onChange={(v) => setMaxAccess(v ?? undefined)}
              placeholder={t('sharing.unlimited')}
            />
          </div>
        </Space>
      </Modal>
    </>
  )
}
