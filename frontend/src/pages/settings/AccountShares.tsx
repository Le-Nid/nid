import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccountShares, useAddAccountShare, useLeaveSharedAccount, useRemoveAccountShare } from '@/hooks/queries'
import { useAuthStore, type GmailAccount } from '@/store/auth.store'
import { SettingsCard } from './shared'

const ADD_ERRORS: Record<number, string> = {
  404: 'settings.share.unknownUser',
  400: 'settings.share.self',
  409: 'settings.share.already',
}

/** « Partage » of an account of one's own: other Nid users who may read its archive (read-only). */
export function AccountSharesBlock({ account }: Readonly<{ account: GmailAccount }>) {
  const { t } = useTranslation()
  const id = useId()
  const [email, setEmail] = useState('')
  const shares = useAccountShares(account.id).data ?? []
  const add = useAddAccountShare(account.id)
  const remove = useRemoveAccountShare(account.id)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    add.mutate(email.trim(), {
      onSuccess: (share) => {
        setEmail('')
        toast.success(t('settings.share.added', { email: share.email }))
      },
      onError: (err) => {
        const status = (err as { response?: { status?: number } }).response?.status ?? 0
        toast.error(t(ADD_ERRORS[status] ?? 'settings.saveFailed'))
      },
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <h3 className="text-sm font-medium">{t('settings.share.title')}</h3>
      <p className="text-sm text-muted-foreground">{t('settings.share.hint')}</p>
      {shares.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={t('settings.share.list')}>
          {shares.map((s) => (
            <li key={s.user_id} className="flex min-h-11 items-center justify-between gap-2 text-sm md:min-h-9">
              <span className="min-w-0 truncate">{s.display_name ? `${s.display_name} · ${s.email}` : s.email}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:size-8"
                aria-label={t('settings.share.revoke', { email: s.email })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(s.user_id, {
                  onSuccess: () => toast.success(t('settings.share.revoked', { email: s.email })),
                  onError: () => toast.error(t('settings.saveFailed')),
                })}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">{t('settings.share.email')}</label>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="off"
          placeholder={t('settings.share.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 min-w-0 flex-1 text-base md:h-9 md:text-sm"
        />
        <Button type="submit" variant="outline" className="h-11 md:h-9" disabled={!email.trim() || add.isPending}>
          {t('settings.share.add')}
        </Button>
      </form>
    </div>
  )
}

/** « Partagés avec moi »: accounts other users let this one read; « Ne plus voir » leaves the share. */
export function SharedWithMe() {
  const { t } = useTranslation()
  const { user, sharedAccounts } = useAuthStore()
  const leave = useLeaveSharedAccount()
  if (!sharedAccounts.length || !user) return null
  return (
    <SettingsCard title={t('settings.share.withMe')} description={t('settings.share.withMeHint')}>
      <ul className="flex flex-col gap-1">
        {sharedAccounts.map((a) => (
          <li key={a.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{t('settings.share.option', { email: a.email, owner: a.shared_by })}</span>
            <Button
              variant="outline"
              className="h-11 md:h-9"
              disabled={leave.isPending}
              onClick={() => leave.mutate({ accountId: a.id, userId: user.id }, {
                onSuccess: () => toast.success(t('settings.share.left', { email: a.email })),
                onError: () => toast.error(t('settings.saveFailed')),
              })}
            >
              {t('settings.share.leave')}
            </Button>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}
