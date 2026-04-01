import { useState } from 'react'
import {
  Card, Table, Button, Space, Typography, Input, Modal, Form,
  Tag, Empty, message, Popconfirm, Select, ColorPicker,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined,
  EditOutlined, FolderOutlined, PlayCircleOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useSavedSearches, useCreateSavedSearch, useDeleteSavedSearch, useUpdateSavedSearch } from '../hooks/queries'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const ICON_OPTIONS = [
  { value: 'folder', label: '📁' },
  { value: 'star', label: '⭐' },
  { value: 'mail', label: '📧' },
  { value: 'attachment', label: '📎' },
  { value: 'invoice', label: '🧾' },
  { value: 'alert', label: '🔔' },
  { value: 'archive', label: '📦' },
  { value: 'calendar', label: '📅' },
  { value: 'work', label: '💼' },
  { value: 'shopping', label: '🛒' },
]

function getIconEmoji(icon: string | null): string {
  return ICON_OPTIONS.find((o) => o.value === icon)?.label ?? '🔍'
}

export default function SavedSearchesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: searches = [], isLoading } = useSavedSearches()
  const createMutation = useCreateSavedSearch()
  const deleteMutation = useDeleteSavedSearch()
  const updateMutation = useUpdateSavedSearch()
  const [messageApi, contextHolder] = message.useMessage()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      query: record.query,
      icon: record.icon,
      color: record.color,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const color = typeof values.color === 'string' ? values.color : values.color?.toHexString?.() ?? null
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...values, color })
        messageApi.success(t('savedSearches.updated'))
      } else {
        await createMutation.mutateAsync({ ...values, color })
        messageApi.success(t('savedSearches.created'))
      }
      setModalOpen(false)
      form.resetFields()
    } catch {
      // validation error
    }
  }

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id)
    messageApi.success(t('savedSearches.deleted'))
  }

  const handleUse = (query: string) => {
    navigate(`/mails?q=${encodeURIComponent(query)}`)
  }

  const columns = [
    {
      title: '',
      width: 40,
      render: (_: any, row: any) => (
        <span style={{ fontSize: 18 }}>{getIconEmoji(row.icon)}</span>
      ),
    },
    {
      title: t('savedSearches.name'),
      dataIndex: 'name',
      ellipsis: true,
      render: (v: string, row: any) => (
        <Space>
          {row.color && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: row.color }} />}
          <Text strong>{v}</Text>
        </Space>
      ),
    },
    {
      title: t('savedSearches.query'),
      dataIndex: 'query',
      ellipsis: true,
      render: (v: string) => (
        <Tag icon={<SearchOutlined />} style={{ maxWidth: 350 }}>
          <Text ellipsis style={{ maxWidth: 330, display: 'inline' }}>{v}</Text>
        </Tag>
      ),
    },
    {
      title: t('savedSearches.created'),
      dataIndex: 'created_at',
      width: 120,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(v).format('DD/MM/YY')}
        </Text>
      ),
    },
    {
      title: '',
      width: 150,
      render: (_: any, row: any) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => handleUse(row.query)}
          >
            {t('savedSearches.use')}
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(row)}
          />
          <Popconfirm
            title={t('savedSearches.deleteConfirm')}
            onConfirm={() => handleDelete(row.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {contextHolder}

      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Title level={3} style={{ margin: 0 }}>
          {t('savedSearches.title')}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('savedSearches.newSearch')}
        </Button>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary">{t('savedSearches.hint')}</Text>
      </Card>

      <Table
        dataSource={searches}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<FolderOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
              description={t('savedSearches.noSearches')}
            >
              <Button type="primary" onClick={openCreate}>
                {t('savedSearches.createFirst')}
              </Button>
            </Empty>
          ),
        }}
      />

      <Modal
        title={editing ? t('savedSearches.editTitle') : t('savedSearches.createTitle')}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText={editing ? t('common.save') : t('common.create')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label={t('savedSearches.name')}
            rules={[{ required: true, message: t('savedSearches.nameRequired') }]}
          >
            <Input placeholder={t('savedSearches.namePlaceholder')} maxLength={255} />
          </Form.Item>
          <Form.Item
            name="query"
            label={t('savedSearches.query')}
            rules={[{ required: true, message: t('savedSearches.queryRequired') }]}
          >
            <Input.TextArea
              placeholder={t('savedSearches.queryPlaceholder')}
              rows={3}
              maxLength={2000}
            />
          </Form.Item>
          <Space>
            <Form.Item name="icon" label={t('savedSearches.icon')}>
              <Select
                allowClear
                style={{ width: 120 }}
                options={ICON_OPTIONS}
                placeholder="📁"
              />
            </Form.Item>
            <Form.Item name="color" label={t('savedSearches.color')}>
              <ColorPicker format="hex" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
