import { useEffect, useState, useCallback } from 'react'
import { Badge, Dropdown, List, Typography, Button, Space, Empty, Popconfirm } from 'antd'
import { BellOutlined, CheckOutlined, DeleteOutlined, ClearOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { notificationsApi } from '../api'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/fr'
import 'dayjs/locale/en'

dayjs.extend(relativeTime)

const { Text } = Typography

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
}

export default function NotificationBell() {
  const { t, i18n } = useTranslation()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list({ limit: 10 })
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      // Silently ignore
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000) // refresh every minute
    return () => clearInterval(interval)
  }, [load])

  const handleMarkRead = async (id: string) => {
    await notificationsApi.markRead(id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleDelete = async (id: string, wasUnread: boolean) => {
    await notificationsApi.remove(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1))
  }

  const handleDeleteAllRead = async () => {
    await notificationsApi.removeAllRead()
    setNotifications((prev) => prev.filter((n) => !n.is_read))
  }

  const readCount = notifications.filter((n) => n.is_read).length

  const dropdownContent = (
    <div style={{
      width: 360,
      maxHeight: 400,
      overflow: 'auto',
      background: 'var(--ant-color-bg-elevated, #fff)',
      borderRadius: 8,
      boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--ant-color-border, #f0f0f0)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Text strong>{t('notifications.title')}</Text>
        <Space size={4}>
          {unreadCount > 0 && (
            <Button size="small" type="link" icon={<CheckOutlined />} onClick={handleMarkAllRead}>
              {t('notifications.markAllRead')}
            </Button>
          )}
          {readCount > 0 && (
            <Popconfirm
              title={t('notifications.clearReadConfirm')}
              onConfirm={handleDeleteAllRead}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
            >
              <Button size="small" type="link" danger icon={<ClearOutlined />}>
                {t('notifications.clearRead')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: 24 }}>
          <Empty description={t('notifications.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <List
          dataSource={notifications}
          renderItem={(item) => (
            <List.Item
              style={{
                padding: '10px 16px',
                cursor: !item.is_read ? 'pointer' : 'default',
                background: item.is_read ? 'transparent' : 'var(--ant-color-primary-bg, #e6f4ff)',
              }}
              onClick={() => !item.is_read && handleMarkRead(item.id)}
              extra={
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleDelete(item.id, !item.is_read) }}
                  aria-label={t('common.delete')}
                />
              }
            >
              <List.Item.Meta
                title={<Text style={{ fontSize: 13 }}>{item.title}</Text>}
                description={
                  <Space direction="vertical" size={2}>
                    {item.body && <Text type="secondary" style={{ fontSize: 12 }}>{item.body}</Text>}
                    <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(item.created_at).locale(i18n.language).fromNow()}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <Dropdown
      dropdownRender={() => dropdownContent}
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      </Badge>
    </Dropdown>
  )
}
