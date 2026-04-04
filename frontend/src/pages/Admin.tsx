import { useState } from 'react'
import {
  Card, Table, Tag, Typography, Tabs, Statistic, Row, Col, Input,
  Select, Switch, Button, Modal, Descriptions, Space, Badge, InputNumber,
} from 'antd'
import {
  UserOutlined, TeamOutlined, CloudOutlined, ScheduleOutlined,
  DatabaseOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { formatBytes } from '../utils/format'
import { STATUS_COLORS } from '../utils/constants'
import { useAdminStats, useAdminUsers, useAdminJobs, useUpdateAdminUser } from '../hooks/queries'

const { Title, Text } = Typography

interface AdminUser {
  id: string
  email: string
  role: string
  display_name: string | null
  avatar_url: string | null
  is_active: boolean
  max_gmail_accounts: number
  storage_quota_bytes: number
  last_login_at: string | null
  created_at: string
  gmail_accounts_count: number
  storage_used_bytes: number
}

interface AdminJob {
  id: string
  type: string
  status: string
  progress: number
  total: number
  processed: number
  user_id: string
  user_email: string
  error: string | null
  created_at: string
  completed_at: string | null
}

export default function AdminPage() {
  const { t } = useTranslation()
  const [usersPage, setUsersPage] = useState(1)
  const [usersSearch, setUsersSearch] = useState('')
  const [jobsPage, setJobsPage] = useState(1)
  const [jobsStatus, setJobsStatus] = useState<string | undefined>()
  const [editUser, setEditUser] = useState<AdminUser | null>(null)

  const { data: stats = null } = useAdminStats()
  const { data: usersData } = useAdminUsers({ page: usersPage, limit: 20, search: usersSearch || undefined })
  const users = usersData?.users ?? []
  const usersTotal = usersData?.total ?? 0
  const { data: jobsData } = useAdminJobs({ page: jobsPage, limit: 20, status: jobsStatus })
  const jobs = jobsData?.jobs ?? []
  const jobsTotal = jobsData?.total ?? 0
  const updateUserMutation = useUpdateAdminUser()

  const handleUpdateUser = async (userId: string, updates: Record<string, any>) => {
    await updateUserMutation.mutateAsync({ userId, updates })
    setEditUser(null)
  }

  const statusColor = STATUS_COLORS

  const usersColumns = [
    {
      title: 'Email', dataIndex: 'email', key: 'email',
      render: (email: string, record: AdminUser) => (
        <Space>
          {record.avatar_url && <img src={record.avatar_url} referrerPolicy="no-referrer" alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />}
          <Text>{email}</Text>
        </Space>
      ),
    },
    {
      title: t('admin.role'), dataIndex: 'role', key: 'role',
      render: (role: string) => <Tag color={role === 'admin' ? 'red' : 'blue'}>{role}</Tag>,
    },
    {
      title: t('admin.isActive'), dataIndex: 'is_active', key: 'is_active',
      render: (active: boolean) => <Badge status={active ? 'success' : 'error'} text={active ? t('common.yes') : t('common.no')} />,
    },
    {
      title: t('admin.gmailAccountCount'), dataIndex: 'gmail_accounts_count', key: 'accounts',
      render: (count: number, record: AdminUser) => `${count} / ${record.max_gmail_accounts}`,
    },
    {
      title: t('admin.storage'), key: 'storage',
      render: (_: any, record: AdminUser) =>
        `${formatBytes(record.storage_used_bytes)} / ${formatBytes(record.storage_quota_bytes)}`,
    },
    {
      title: t('admin.lastLogin'), dataIndex: 'last_login_at', key: 'last_login',
      render: (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '—',
    },
    {
      title: t('admin.actions'), key: 'actions',
      render: (_: any, record: AdminUser) => (
        <Button size="small" onClick={() => setEditUser(record)}>{t('common.edit')}</Button>
      ),
    },
  ]

  const jobsColumns = [
    { title: t('admin.jobType'), dataIndex: 'type', key: 'type' },
    {
      title: t('admin.jobStatus'), dataIndex: 'status', key: 'status',
      render: (s: string) => <Tag color={statusColor[s] ?? 'default'}>{s}</Tag>,
    },
    {
      title: t('admin.jobProgress'), key: 'progress',
      render: (_: any, r: AdminJob) => `${r.processed}/${r.total} (${r.progress}%)`,
    },
    { title: t('admin.jobUser'), dataIndex: 'user_email', key: 'user_email' },
    {
      title: t('admin.jobCreated'), dataIndex: 'created_at', key: 'created_at',
      render: (d: string) => new Date(d).toLocaleString('fr-FR'),
    },
    {
      title: t('admin.jobError'), dataIndex: 'error', key: 'error',
      render: (e: string | null) => e ? <Text type="danger" ellipsis style={{ maxWidth: 200 }}>{e}</Text> : '—',
    },
  ]

  return (
    <div>
      <Title level={3}>{t('admin.title')}</Title>

      {/* Stats globales */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card><Statistic title={t('admin.users')} value={stats.users} prefix={<TeamOutlined />} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title={t('admin.gmailAccounts')} value={stats.gmailAccounts} prefix={<CloudOutlined />} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title={t('admin.totalJobs')} value={stats.jobs.total} prefix={<ScheduleOutlined />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}> ({t('admin.activeJobs', { count: stats.jobs.active })})</Text>} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title={t('admin.archives')} value={stats.archives.totalMails} prefix={<DatabaseOutlined />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}> ({formatBytes(stats.archives.totalSizeBytes)})</Text>} /></Card>
          </Col>
        </Row>
      )}

      <Tabs items={[
        {
          key: 'users',
          label: <span><UserOutlined /> {t('admin.users')}</span>,
          children: (
            <>
              <Input.Search
                placeholder={t('admin.searchPlaceholder')}
                allowClear
                onSearch={(v) => { setUsersSearch(v); setUsersPage(1) }}
                style={{ width: 300, marginBottom: 16 }}
                prefix={<SearchOutlined />}
              />
              <Table
                dataSource={users}
                columns={usersColumns}
                rowKey="id"
                pagination={{
                  current: usersPage, pageSize: 20, total: usersTotal,
                  onChange: setUsersPage, showSizeChanger: false,
                }}
              />
            </>
          ),
        },
        {
          key: 'jobs',
          label: <span><ScheduleOutlined /> Jobs</span>,
          children: (
            <>
              <Select
                placeholder={t('admin.filterStatus')}
                allowClear
                style={{ width: 200, marginBottom: 16 }}
                onChange={(v) => { setJobsStatus(v); setJobsPage(1) }}
                options={[
                  { value: 'active', label: t('jobs.active') },
                  { value: 'completed', label: t('jobs.completed') },
                  { value: 'failed', label: t('jobs.failed') },
                  { value: 'pending', label: t('jobs.pending') },
                  { value: 'cancelled', label: t('jobs.cancelled') },
                ]}
              />
              <Table
                dataSource={jobs}
                columns={jobsColumns}
                rowKey="id"
                pagination={{
                  current: jobsPage, pageSize: 20, total: jobsTotal,
                  onChange: setJobsPage, showSizeChanger: false,
                }}
              />
            </>
          ),
        },
      ]} />

      {/* Modal modification utilisateur */}
      <Modal
        title={t('admin.editUser')}
        open={!!editUser}
        onCancel={() => setEditUser(null)}
        footer={null}
        width={560}
      >
        {editUser && (
          <EditUserForm
            user={editUser}
            loading={updateUserMutation.isPending}
            onSave={(updates) => handleUpdateUser(editUser.id, updates)}
          />
        )}
      </Modal>
    </div>
  )
}

function EditUserForm({
  user, loading, onSave,
}: {
  user: AdminUser; loading: boolean; onSave: (updates: Record<string, any>) => void
}) {
  const { t } = useTranslation()
  const [role, setRole] = useState(user.role)
  const [isActive, setIsActive] = useState(user.is_active)
  const [maxAccounts, setMaxAccounts] = useState(user.max_gmail_accounts)
  const [quota, setQuota] = useState(Math.round(user.storage_quota_bytes / 1_073_741_824)) // en Go

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label={t('admin.email')}>{user.email}</Descriptions.Item>
        <Descriptions.Item label={t('admin.role')}>{user.display_name ?? '—'}</Descriptions.Item>
        <Descriptions.Item label={t('admin.registeredAt')}>{new Date(user.created_at).toLocaleDateString()}</Descriptions.Item>
        <Descriptions.Item label={t('admin.storageUsed')}>{formatBytes(user.storage_used_bytes)}</Descriptions.Item>
      </Descriptions>

      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>{t('admin.role')} : </Text>
          <Select value={role} onChange={setRole} style={{ width: 120 }}
            options={[{ value: 'user', label: t('admin.roleUser') }, { value: 'admin', label: t('admin.roleAdmin') }]} />
        </div>
        <div>
          <Text strong>{t('admin.isActive')} : </Text>
          <Switch checked={isActive} onChange={setIsActive} />
        </div>
        <div>
          <Text strong>{t('admin.maxGmailAccounts')} : </Text>
          <InputNumber min={1} max={50} value={maxAccounts} onChange={(v) => setMaxAccounts(v ?? 3)} />
        </div>
        <div>
          <Text strong>{t('admin.storageQuota')} : </Text>
          <InputNumber min={1} max={1000} value={quota} onChange={(v) => setQuota(v ?? 5)} />
        </div>
      </Space>

      <Button type="primary" loading={loading} onClick={() => onSave({
        role,
        is_active: isActive,
        max_gmail_accounts: maxAccounts,
        storage_quota_bytes: quota * 1_073_741_824,
      })}>
        {t('common.save')}
      </Button>
    </Space>
  )
}
