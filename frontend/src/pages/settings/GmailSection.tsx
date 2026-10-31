import { useId, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { gmailAccountsApi, type BackupInterval } from '@/api'
import {
  useDashboardArchiveStats, useDisconnectGmailAccount, useSyncGmailAccount, useUpdateGmailAccount,
} from '@/hooks/queries'
import type { LiveCounters } from '@/hooks/useLiveCounters'
import { useAuthStore, type GmailAccount } from '@/store/auth.store'
import { formatRelative } from '@/utils/format'
import { SettingsCard, SwitchRow, selectClass } from './shared'
import { AccountSetupWizard } from './AccountSetupWizard'

const INTERVALS: BackupInterval[] = ['1h', '6h', '24h']

/** Google consent page: adds an account, or renews the tokens of one already there (« Reconnecter »). */
function useConnectGmail() {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const connect = () => {
    setPending(true)
    gmailAccountsApi.connectUrl()
      .then(({ url }) => { globalThis.location.href = url })
      .catch((err: { response?: { status?: number } }) => {
        setPending(false)
        toast.error(t(err.response?.status === 403 ? 'settings.gmail.limitReached' : 'settings.gmail.connectFailed'))
      })
  }
  return { connect, pending }
}

function Status({ account }: Readonly<{ account: GmailAccount }>) {
  const { t } = useTranslation()
  if (!account.is_active) return <span className="rounded-full bg-muted px-2 text-xs leading-[22px] font-medium text-muted-foreground">{t('settings.gmail.disconnectedState')}</span>
  if (account.needs_reauth) {
    return <span className="rounded-full border border-warning-border bg-warning-soft px-2 text-xs leading-[22px] font-medium text-warning">{t('settings.gmail.actionRequired')}</span>
  }
  return <span className="rounded-full bg-success-soft px-2 text-xs leading-[22px] font-medium text-success">{t('settings.gmail.synced')}</span>
}

function AccountCard({ account, mails, onReconnect }: Readonly<{ account: GmailAccount; mails: number | null | undefined; onReconnect: () => void }>) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const archive = useDashboardArchiveStats(account.id).data
  const update = useUpdateGmailAccount()
  const sync = useSyncGmailAccount()
  const disconnect = useDisconnectGmailAccount()
  const failed = () => toast.error(t('settings.saveFailed'))
  const save = (body: { backup_enabled?: boolean; backup_interval?: BackupInterval }) => update.mutate({ id: account.id, ...body }, { onError: failed })

  const archived = archive ? Number(archive.total_mails ?? 0) : null
  const syncLine = [
    account.last_sync_at ? t('settings.gmail.lastSync', { when: formatRelative(account.last_sync_at, i18n.language) }) : t('settings.gmail.neverSynced'),
    typeof mails === 'number' ? t('settings.gmail.mails', { count: mails }) : null,
  ]
  const backupLine = [
    archive?.last_archived_at ? t('archives.status.last', { when: formatRelative(archive.last_archived_at, i18n.language) }) : t('archives.status.never'),
    archived === null ? null : t('archives.status.count', { count: archived }),
    archived !== null && typeof mails === 'number' && mails > 0
      ? new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(Math.min(1, archived / mails))
      : null,
  ]

  return (
    <SettingsCard title={account.email} description={<Status account={account} />}>
      {account.needs_reauth && account.is_active && <p className="text-sm text-warning">{t('settings.gmail.actionRequiredHint')}</p>}
      {!account.is_active && <p className="text-sm text-muted-foreground">{t('settings.gmail.disconnectedHint')}</p>}
      <dl className="grid gap-2 text-sm md:grid-cols-[max-content_1fr] md:gap-x-6">
        <dt className="text-muted-foreground">{t('settings.gmail.sync')}</dt>
        <dd>{syncLine.filter(Boolean).join(' · ')}</dd>
        <dt className="text-muted-foreground">{t('settings.gmail.backup')}</dt>
        <dd>{backupLine.filter(Boolean).join(' · ')}</dd>
      </dl>
      {account.is_active ? (
        <>
          <SwitchRow
            label={t('settings.gmail.autoBackup')}
            description={t('settings.gmail.autoBackupHint')}
            checked={!!account.backup_enabled}
            onChange={(on) => save({ backup_enabled: on })}
            disabled={update.isPending}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`${id}-every`} className="text-sm font-medium">{t('settings.gmail.frequency')}</label>
            <select
              id={`${id}-every`}
              value={account.backup_interval ?? '24h'}
              disabled={!account.backup_enabled || update.isPending}
              onChange={(e) => save({ backup_interval: e.target.value as BackupInterval })}
              className={selectClass}
            >
              {INTERVALS.map((every) => <option key={every} value={every}>{t(`settings.gmail.every.${every}`)}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-11 md:h-9"
              disabled={sync.isPending || account.needs_reauth}
              onClick={() => sync.mutate(account.id, { onSuccess: () => toast.success(t('settings.gmail.syncDone')), onError: () => toast.error(t('settings.gmail.syncFailed')) })}
            >
              <RefreshCw aria-hidden="true" />{t('settings.gmail.syncNow')}
            </Button>
            <Button variant={account.needs_reauth ? 'default' : 'outline'} className="h-11 md:h-9" onClick={onReconnect}>
              {t('settings.gmail.reconnect')}
            </Button>
            <ConfirmDialog
              trigger={<Button variant="destructive" className="h-11 md:h-9">{t('settings.gmail.disconnect')}</Button>}
              title={t('settings.gmail.disconnectTitle', { email: account.email })}
              description={t('settings.gmail.disconnectDescription')}
              confirmLabel={t('settings.gmail.disconnect')}
              destructive
              onConfirm={() => disconnect.mutate(account.id, {
                onSuccess: () => toast.success(t('settings.gmail.disconnected', { email: account.email })),
                onError: failed,
              })}
            />
          </div>
        </>
      ) : (
        // Reconnecting the same address brings this account back, archives included (same row server-side)
        <Button className="h-11 w-fit md:h-9" onClick={onReconnect}>{t('settings.gmail.reconnect')}</Button>
      )}
    </SettingsCard>
  )
}

/** « Comptes Gmail » (§7.7): state, last sync and backup, automatic backup (B12), reconnect, disconnect, add. */
export function GmailSection() {
  const { t } = useTranslation()
  const { user, gmailAccounts } = useAuthStore()
  const counters = useOutletContext<LiveCounters | null>()
  const [params, setParams] = useSearchParams()
  const { connect, pending } = useConnectGmail()
  const max = user?.max_gmail_accounts ?? 3
  const status = params.get('gmail')
  // new=1: Google just added this account (not a reconnection) → setup wizard, once
  const added = params.get('new') === '1' ? gmailAccounts.find((a) => a.email === params.get('account')) : undefined
  const closeWizard = () => setParams((p) => { p.delete('new'); return p }, { replace: true })

  const add = (
    <Button className="h-11 w-fit md:h-9" disabled={pending || gmailAccounts.length >= max} onClick={connect}>
      <Plus aria-hidden="true" />{t('settings.gmail.add')}
    </Button>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Back from Google's consent page (OAuth callback) */}
      {status === 'connected' && <output className="block rounded-lg bg-success-soft px-4 py-3 text-success">{t('settings.gmail.connected', { email: params.get('account') ?? '' })}</output>}
      {added && <AccountSetupWizard account={added} onClose={closeWizard} />}
      {status === 'error' && <p role="alert" className="rounded-lg bg-destructive-soft px-4 py-3 text-destructive">{t('settings.gmail.connectFailed')}</p>}
      {gmailAccounts.length === 0 ? (
        <EmptyState title={t('settings.gmail.none')} description={t('settings.gmail.scopeHint')} action={add} />
      ) : (
        <>
          {gmailAccounts.map((a) => <AccountCard key={a.id} account={a} mails={counters?.mails[a.id]} onReconnect={connect} />)}
          <div className="flex flex-col gap-1">
            {add}
            <p className="text-sm text-muted-foreground">{t('settings.gmail.quota', { count: gmailAccounts.length, max })} · {t('settings.gmail.scopeHint')}</p>
          </div>
        </>
      )}
    </div>
  )
}
