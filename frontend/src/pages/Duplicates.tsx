import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Typography, Space, Tag, Card, Empty,
  Statistic, Row, Col, message, Popconfirm,
} from 'antd'
import {
  CopyOutlined, DeleteOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { duplicatesApi } from '../api'
import { useAccount } from '../hooks/useAccount'
import { formatBytes } from '../utils/format'

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
  const { accountId } = useAccount()
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [totalDuplicateMails, setTotalDuplicateMails] = useState(0)
  const [totalDuplicateSize, setTotalDuplicateSize] = useState(0)
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      const data = await duplicatesApi.detectArchived(accountId)
      setGroups(data.groups)
      setTotalDuplicateMails(data.totalDuplicateMails)
      setTotalDuplicateSize(data.totalDuplicateSizeBytes)
    } catch {
      messageApi.error('Erreur lors de la détection des doublons')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { load() }, [load])

  const handleDeleteDuplicates = async (group: DuplicateGroup) => {
    // Keep first (newest), delete the rest
    const toDelete = group.mailIds.slice(1)
    const key = `${group.subject}-${group.sender}-${group.dateGroup}`
    setDeletingGroup(key)
    try {
      const result = await duplicatesApi.deleteArchived(accountId!, toDelete)
      messageApi.success(`${result.deleted} doublons supprimés`)
      load()
    } catch {
      messageApi.error('Erreur lors de la suppression')
    } finally {
      setDeletingGroup(null)
    }
  }

  const columns = [
    {
      title: 'Sujet',
      key: 'subject',
      render: (_: any, row: DuplicateGroup) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{row.subject || '(sans sujet)'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.sender}</Text>
        </Space>
      ),
    },
    {
      title: 'Date',
      key: 'date',
      width: 140,
      render: (_: any, row: DuplicateGroup) => {
        try { return new Date(row.dateGroup).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
        catch { return '-' }
      },
    },
    {
      title: 'Copies',
      dataIndex: 'count',
      width: 90,
      sorter: (a: DuplicateGroup, b: DuplicateGroup) => a.count - b.count,
      render: (v: number) => <Tag color={v > 3 ? 'red' : 'orange'}>{v} copies</Tag>,
    },
    {
      title: 'Taille totale',
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
            title={`Supprimer ${row.count - 1} doublon(s) ?`}
            description="Le mail le plus récent sera conservé."
            onConfirm={() => handleDeleteDuplicates(row)}
            okText="Supprimer"
            okButtonProps={{ danger: true }}
            cancelText="Annuler"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingGroup === key}
            >
              Supprimer {row.count - 1}
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
        <Title level={3} style={{ margin: 0 }}>🔁 Doublons (archives)</Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Analyser
        </Button>
      </Space>

      {!accountId ? (
        <Empty description="Aucun compte Gmail connecté" />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Groupes de doublons" value={groups.length} prefix={<CopyOutlined />} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Mails en double" value={totalDuplicateMails} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Espace récupérable" value={formatBytes(totalDuplicateSize)} />
              </Card>
            </Col>
          </Row>

          <Card size="small" style={{ marginBottom: 16, background: '#fff7e6', borderColor: '#ffd591' }}>
            <Text style={{ fontSize: 13 }}>
              Détection basée sur les <strong>archives locales</strong> (même sujet + expéditeur + date).
              Le mail le plus récent est conservé, les copies sont supprimées de l'index.
            </Text>
          </Card>

          <Table
            dataSource={groups}
            columns={columns}
            rowKey={(r) => `${r.subject}-${r.sender}-${r.dateGroup}`}
            loading={loading}
            size="small"
            pagination={{ pageSize: 50, showTotal: (t) => `${t} groupes de doublons` }}
            locale={{ emptyText: <Empty description="Aucun doublon détecté dans vos archives" /> }}
          />
        </>
      )}
    </div>
  )
}
