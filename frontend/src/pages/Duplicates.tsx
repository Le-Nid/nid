import { useState } from 'react'
import {
  Table, Button, Typography, Space, Tag, Card, Empty,
  Statistic, Row, Col, message, Popconfirm,
} from 'antd'
import { Copy, Trash2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../hooks/useAccount'
import { formatBytes } from '../utils/format'
import { useDuplicates, useDeleteDuplicates } from '../hooks/queries'

const { Title, Text } = Typography

interface DuplicateGroup {
  subject: string | null
  sender: string | null
  dateGroup: string
  count: number
  totalSizeBytes: number
  mailIds: string[]
}

export default function DuplicatesPage() {
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const { data, isLoading: loading, refetch } = useDuplicates(accountId)
  const load = () => { refetch() }
  const deleteMutation = useDeleteDuplicates(accountId!)
  const groups = data?.groups ?? []
  const totalDuplicateMails = data?.totalDuplicateMails ?? 0
  const totalDuplicateSize = data?.totalDuplicateSizeBytes ?? 0
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const handleDeleteDuplicates = async (group: DuplicateGroup) => {
    // Keep first (newest), delete the rest
    const toDelete = group.mailIds.slice(1)
    const key = `${group.subject}-${group.sender}-${group.dateGroup}`
    setDeletingGroup(key)
    try {
      const result = await deleteMutation.mutateAsync(toDelete)
      messageApi.success(t('duplicates.deleteSuccess', { count: result.deleted }))
    } catch {
      messageApi.error(t('duplicates.deleteError'))
    } finally {
      setDeletingGroup(null)
    }
  }

  const columns = [
    {
      title: t('duplicates.subject'),
      key: 'subject',
      render: (_: any, row: DuplicateGroup) => (
        <Space orientation="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{row.subject || t('common.noSubject')}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.sender}</Text>
        </Space>
      ),
    },
    {
      title: t('duplicates.date'),
      key: 'date',
      width: 140,
      render: (_: any, row: DuplicateGroup) => {
        try { return new Date(row.dateGroup).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
        catch { return '-' }
      },
    },
    {
      title: t('duplicates.copies'),
      dataIndex: 'count',
      width: 90,
      sorter: (a: DuplicateGroup, b: DuplicateGroup) => a.count - b.count,
      render: (v: number) => <Tag color={v > 3 ? 'red' : 'orange'}>{t('duplicates.copiesTag', { count: v })}</Tag>,
    },
    {
      title: t('duplicates.totalSize'),
      dataIndex: 'totalSizeBytes',
      width: 120,
      sorter: (a: DuplicateGroup, b: DuplicateGroup) => a.totalSizeBytes - b.totalSizeBytes,
      render: (v: number) => formatBytes(v),
    },
    {
      title: '',
      width: 140,
      render: (_: any, row: DuplicateGroup) => {
        const key = `${row.subject}-${row.sender}-${row.dateGroup}`
        return (
          <Popconfirm
            title={t('duplicates.deleteConfirm', { count: row.count - 1 })}
            description={t('duplicates.deleteHint')}
            onConfirm={() => handleDeleteDuplicates(row)}
            okText={t('common.delete')}
            okButtonProps={{ danger: true }}
            cancelText={t('common.cancel')}
          >
            <Button
              size="small"
              danger
              icon={<Trash2 size={14} />}
              loading={deletingGroup === key}
            >
              {t('duplicates.deleteCount', { count: row.count - 1 })}
            </Button>
          </Popconfirm>
        )
      },
    },
  ]

  return (
    <div>
      {contextHolder}

      <Space style={{ marginBottom: 16 }} align="center">
        <Copy size={20} />
        <Title level={3} style={{ margin: 0 }}>{t('duplicates.title')}</Title>
        <Button icon={<RefreshCw size={14} />} onClick={load} loading={loading}>
          {t('duplicates.analyze')}
        </Button>
      </Space>

      {!accountId ? (
        <Empty description={t('duplicates.noAccount')} />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title={t('duplicates.groups')} value={groups.length} prefix={<Copy size={14} />} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title={t('duplicates.duplicateMails')} value={totalDuplicateMails} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title={t('duplicates.reclaimableSpace')} value={formatBytes(totalDuplicateSize)} />
              </Card>
            </Col>
          </Row>

          <Card size="small" style={{ marginBottom: 16, background: '#fff7e6', borderColor: '#ffd591' }}>
            <Text style={{ fontSize: 13 }}>{t('duplicates.hint')}</Text>
          </Card>

          <Table
            dataSource={groups}
            columns={columns}
            rowKey={(r) => `${r.subject}-${r.sender}-${r.dateGroup}`}
            loading={loading}
            size="small"
            pagination={{ pageSize: 50, showTotal: (t) => `${t} groupes de doublons` }}
            locale={{ emptyText: <Empty description={t('duplicates.noDuplicates')} /> }}
          />
        </>
      )}
    </div>
  )
}
