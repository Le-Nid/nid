import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Plus, Webhook as WebhookIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { FormField } from '@/components/app/FormField'
import { LoadError } from '@/components/app/LoadError'
import { RowMenu } from '@/components/app/RowMenu'
import { Toggle } from '@/components/app/Toggle'
import {
  useCreateWebhook, useDeleteWebhook, useNotificationPreferences, useTestWebhook, useToggleWebhook,
  useUpdateNotificationPreferences, useWebhooks,
} from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import { SettingsCard, selectClass } from './shared'

type Webhook = { id: string; name: string; url: string; type: string; events: string[]; is_active: boolean; last_status: number | null }

// Notification preference key → webhook event (none for the weekly report: in-app only)
const EVENTS: [pref: string, event: string | null][] = [
  ['weekly_report', null],
  ['job_completed', 'job.completed'],
  ['job_failed', 'job.failed'],
  ['rule_executed', 'rule.executed'],
  ['quota_warning', 'quota.warning'],
  ['integrity_alert', 'integrity.failed'],
  ['account_reauth', 'account.reauth_required'],
]
const WEBHOOK_EVENTS = EVENTS.filter(([, event]) => event) as [string, string][]
const TYPES = ['generic', 'discord', 'slack', 'ntfy']

/** In-app (bell) and toast switches per event (§7.7), optimistic. */
function PreferencesCard() {
  const { t } = useTranslation()
  const prefs = useNotificationPreferences().data as Record<string, boolean> | undefined
  const update = useUpdateNotificationPreferences()
  const set = (key: string, value: boolean) => update.mutate({ [key]: value }, { onError: () => toast.error(t('settings.saveFailed')) })

  return (
    <SettingsCard title={t('settings.notifications.title')} description={t('settings.notifications.hint')}>
      <ul className="flex flex-col divide-y">
        {EVENTS.map(([key]) => (
          <li key={key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{t(`settings.notifications.event.${key}`)}</span>
              <span className="text-sm text-muted-foreground">{t(`settings.notifications.event.${key}Hint`)}</span>
            </div>
            <div className="flex gap-6">
              {[key, `${key}_toast`].map((pref, i) => (
                <label key={pref} className="flex min-h-11 items-center gap-3 text-sm md:min-h-0">
                  <Toggle
                    checked={!!prefs?.[pref]}
                    disabled={!prefs}
                    onCheckedChange={(v) => set(pref, v)}
                    aria-label={[t(i ? 'settings.notifications.toast' : 'settings.notifications.inApp'), t('settings.notifications.event.' + key)].join(' — ')}
                  />
                  <span aria-hidden="true">{t(i ? 'settings.notifications.toast' : 'settings.notifications.inApp')}</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}

function WebhookForm({ onClose }: Readonly<{ onClose: () => void }>) {
  const { t } = useTranslation()
  const id = useId()
  const create = useCreateWebhook()
  const [type, setType] = useState('generic')
  const [events, setEvents] = useState<string[]>([])

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const field = (name: string) => { const v = form.get(name); return typeof v === 'string' ? v.trim() : '' }
    if (!events.length) return void toast.error(t('settings.webhooks.eventsRequired'))
    create.mutate({
      name: field('name'), url: field('url'), type, events,
      ...(type === 'ntfy' ? { auth_user: field('auth_user') || undefined, auth_password: field('auth_password') || undefined } : {}),
    }, {
      onSuccess: () => {
        toast.success(t('settings.webhooks.created'))
        onClose()
      },
      onError: () => toast.error(t('settings.webhooks.createFailed')),
    })
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{t('settings.webhooks.new')}</SheetTitle>
        <SheetDescription>{t('settings.webhooks.formDescription')}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
        <FormField id={`${id}-name`} label={t('settings.webhooks.name')}>
          <Input id={`${id}-name`} name="name" required maxLength={100} className="h-11 text-base md:h-9 md:text-sm" />
        </FormField>
        <FormField id={`${id}-url`} label={t('settings.webhooks.url')}>
          <Input id={`${id}-url`} name="url" type="url" inputMode="url" required placeholder="https://" className="h-11 text-base md:h-9 md:text-sm" />
        </FormField>
        <FormField id={`${id}-type`} label={t('settings.webhooks.type')}>
          <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            {TYPES.map((v) => <option key={v} value={v}>{t(`settings.webhooks.types.${v}`)}</option>)}
          </select>
        </FormField>
        {type === 'ntfy' && (
          <>
            <FormField id={`${id}-user`} label={t('settings.webhooks.ntfyUser')}>
              <Input id={`${id}-user`} name="auth_user" autoComplete="off" maxLength={255} className="h-11 text-base md:h-9 md:text-sm" />
            </FormField>
            <FormField id={`${id}-pass`} label={t('settings.webhooks.ntfyPassword')}>
              <Input id={`${id}-pass`} name="auth_password" type="password" autoComplete="new-password" maxLength={255} className="h-11 text-base md:h-9 md:text-sm" />
            </FormField>
          </>
        )}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1.5 text-sm font-medium">{t('settings.webhooks.events')}</legend>
          {WEBHOOK_EVENTS.map(([key, event]) => (
            <label key={event} className="flex min-h-11 items-center gap-3 text-sm md:min-h-8">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={events.includes(event)}
                onChange={(e) => setEvents(e.target.checked ? [...events, event] : events.filter((x) => x !== event))}
              />
              {t(`settings.notifications.event.${key}`)}
            </label>
          ))}
        </fieldset>
      </div>
      <SheetFooter className="pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button type="submit" className="h-11 md:h-9" disabled={create.isPending}>{t('common.create')}</Button>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onClose}>{t('common.cancel')}</Button>
      </SheetFooter>
    </form>
  )
}

/** Webhooks (Discord, Slack, ntfy, generic HMAC): list, on/off, test, delete (confirm), create in a sheet. */
function WebhooksCard() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const query = useWebhooks()
  const toggle = useToggleWebhook()
  const test = useTestWebhook()
  const remove = useDeleteWebhook()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Webhook | null>(null)
  const webhooks = (query.data ?? []) as Webhook[]
  const eventLabel = (event: string) => {
    const key = WEBHOOK_EVENTS.find(([, e]) => e === event)?.[0]
    return key ? t(`settings.notifications.event.${key}`) : event
  }

  let list
  if (query.isError) list = <LoadError message={t('settings.webhooks.loadError')} onRetry={() => void query.refetch()} />
  else if (!webhooks.length) list = query.isLoading ? null : <EmptyState icon={<WebhookIcon />} title={t('settings.webhooks.empty')} description={t('settings.webhooks.emptyDescription')} />
  else {
    list = (
      <ul className="flex flex-col divide-y">
        {webhooks.map((w) => (
          <li key={w.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {w.name} <span className="font-normal text-muted-foreground">· {t(`settings.webhooks.types.${w.type}`)}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {w.events.map(eventLabel).join(', ')}
                {w.last_status ? ` · ${t('settings.webhooks.lastStatus', { status: w.last_status })}` : ''}
              </span>
            </div>
            <Toggle
              checked={w.is_active}
              onCheckedChange={() => toggle.mutate(w.id, { onError: () => toast.error(t('settings.saveFailed')) })}
              aria-label={t('settings.webhooks.toggle', { name: w.name })}
            />
            <RowMenu
              label={t('settings.webhooks.actions', { name: w.name })}
              items={[
                {
                  key: 'test',
                  label: t('settings.webhooks.test'),
                  onSelect: () => test.mutate(w.id, {
                    onSuccess: () => toast.success(t('settings.webhooks.testSent')),
                    onError: () => toast.error(t('settings.webhooks.testFailed')),
                  }),
                },
                { key: 'delete', label: t('common.delete'), onSelect: () => setDeleting(w), destructive: true },
              ]}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <SettingsCard title={t('settings.webhooks.title')} description={t('settings.webhooks.hint')}>
      {list}
      <Button variant="outline" className="h-11 w-fit md:h-9" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t('settings.webhooks.new')}</Button>
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} showCloseButton={false} className="max-h-[90dvh] sm:max-w-md">
          {creating && <WebhookForm onClose={() => setCreating(false)} />}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('settings.webhooks.confirmDelete', { name: deleting?.name })}
        description={t('settings.webhooks.confirmDeleteDescription')}
        confirmLabel={t('settings.webhooks.deleteAction')}
        destructive
        onConfirm={() => deleting && remove.mutate(deleting.id, {
          onSuccess: () => toast.success(t('settings.webhooks.deleted')),
          onError: () => toast.error(t('settings.webhooks.deleteFailed')),
        })}
      />
    </SettingsCard>
  )
}

/** « Notifications & webhooks » (§7.7). ntfy is a webhook type (with optional basic auth). */
export function NotificationsSection() {
  return (
    <div className="flex flex-col gap-4">
      <PreferencesCard />
      <WebhooksCard />
    </div>
  )
}
