import { useEffect, useState } from 'react'
import { Table, Tag, Progress, Button, Typography, Space, Tooltip } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'
import dayjs from 'dayjs'

const { Title } = Typography

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  active: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
}

const JOB_TYPE_LABEL: Record<string, string> = {
  bulk_operation: 'Opération bulk',
  archive_mails: 'Archivage',
  run_rule: 'Règle auto',
  sync_dashboard: 'Sync dashboard',
}

export default function JobsPage() {
  const { activeAccountId } = useAuthStore()
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchJobs = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/jobs', {
        params: activeAccountId ? { accountId: activeAccountId } : {},
      })
      setJobs(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    // Poll every 3s for active jobs
    const interval = setInterval(() => {
      if (jobs.some((j) => j.status === 'active' || j.status === 'pending')) fetchJobs()
    }, 3000)
    return () => clearInterval(interval)
  }, [activeAccountId])

  const cancelJob = async (jobId: string) => {
    await api.delete(`/api/jobs/${jobId}`)
    fetchJobs()
  }

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      render: (t: string) => JOB_TYPE_LABEL[t] ?? t,
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s.toUpperCase()}</Tag>,
    },
    {
      title: 'Progression',
      render: (_: any, record: any) => (
        <Progress
          percent={record.progress}
          size="small"
          format={() => `${record.processed ?? 0} / ${record.total ?? 0}`}
          status={record.status === 'failed' ? 'exception' : record.status === 'completed' ? 'success' : 'active'}
        />
      ),
      width: 220,
    },
    {
      title: 'Créé le',
      dataIndex: 'created_at',
      render: (d: string) => dayjs(d).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'Terminé le',
      dataIndex: 'completed_at',
      render: (d: string) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm:ss') : '—'),
    },
    {
      title: 'Erreur',
      dataIndex: 'error',
      render: (e: string) =>
        e ? (
          <Tooltip title={e}>
            <Tag color="error">Voir erreur</Tag>
          </Tooltip>
        ) : '—',
    },
    {
      title: '',
      render: (_: any, record: any) =>
        record.status === 'active' || record.status === 'pending' ? (
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => cancelJob(record.id)}
          >
            Annuler
          </Button>
        ) : null,
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={3} style={{ margin: 0 }}>⚙️ Jobs</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchJobs} loading={loading}>
          Rafraîchir
        </Button>
      </Space>

      <Table
        dataSource={jobs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  )
}
