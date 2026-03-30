import { useEffect, useState, useCallback } from 'react'
import { Badge, Dropdown, List, Typography, Button, Space, Empty } from 'antd'
import { BellOutlined, CheckOutlined } from '@ant-design/icons'
import { notificationsApi } from '../api'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/fr'

dayjs.extend(relativeTime)
dayjs.locale('fr')

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
        <Text strong>Notifications</Text>
        {unreadCount > 0 && (
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={handleMarkAllRead}>
            Tout marquer lu
          </Button>
        )}
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: 24 }}>
          <Empty description="Aucune notification" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
            >
              <List.Item.Meta
                title={<Text style={{ fontSize: 13 }}>{item.title}</Text>}
                description={
                  <Space direction="vertical" size={2}>
                    {item.body && <Text type="secondary" style={{ fontSize: 12 }}>{item.body}</Text>}
                    <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(item.created_at).fromNow()}</Text>
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
