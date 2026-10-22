import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Check, ListX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { notificationsApi } from '@/api'
import { formatRelative } from '@/utils/format'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
}

/** Header bell: the 10 latest notifications, polled every minute; a click on an unread one marks it read. */
export default function NotificationBell() {
  const { t, i18n } = useTranslation()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)

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

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative size-11 md:size-9"
            aria-label={unreadCount ? t('notifications.bellUnread', { count: unreadCount }) : t('notifications.title')}
          >
            <Bell aria-hidden="true" />
            {unreadCount > 0 && (
              <span aria-hidden="true" className="absolute top-1 right-1 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(360px,calc(100vw-1.5rem))] p-0">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <h2 className="font-semibold">{t('notifications.title')}</h2>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                  <Check aria-hidden="true" />{t('notifications.markAllRead')}
                </Button>
              )}
              {readCount > 0 && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmClear(true)}>
                  <ListX aria-hidden="true" />{t('notifications.clearRead')}
                </Button>
              )}
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('notifications.empty')}</p>
          ) : (
            <ul className="max-h-[400px] divide-y overflow-y-auto">
              {notifications.map((item) => {
                const content = (
                  <>
                    <span className={cn('block text-sm', !item.is_read && 'font-medium')}>{item.title}</span>
                    {item.body && <span className="block text-xs text-muted-foreground">{item.body}</span>}
                    <span className="block text-xs text-muted-foreground">{formatRelative(item.created_at, i18n.language)}</span>
                  </>
                )
                return (
                  <li key={item.id} className={cn('flex items-start gap-2 px-4 py-2.5', !item.is_read && 'bg-primary-soft')}>
                    {item.is_read ? (
                      <div className="min-w-0 flex-1">{content}</div>
                    ) : (
                      <button type="button" className="min-w-0 flex-1 rounded-sm text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" onClick={() => handleMarkRead(item.id)}>
                        {content}
                        <span className="sr-only">{t('notifications.markRead')}</span>
                      </button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 text-destructive md:size-8"
                      onClick={() => handleDelete(item.id, !item.is_read)}
                      aria-label={t('notifications.delete', { title: item.title })}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('notifications.clearReadConfirm')}
        description={t('notifications.clearReadDescription', { count: readCount })}
        confirmLabel={t('notifications.clearRead')}
        onConfirm={handleDeleteAllRead}
        destructive
      />
    </>
  )
}
