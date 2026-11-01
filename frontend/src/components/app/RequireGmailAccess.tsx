import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Archive, Unplug } from 'lucide-react'
import { useAccount } from '@/hooks/useAccount'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'

/**
 * Pages that act on Gmail (Vue d'ensemble, Mails, Nettoyage, Règles): a disconnected account (soft disconnect)
 * has no Gmail access, so they offer the reconnection instead of failing on every call. Archives stays available.
 * An IMAP account is archived only: those pages point to Archives, except the overview (`imapOk`), which shows its archive figures.
 * An account shared by another user (read-only) only opens Archives.
 */
export function RequireGmailAccess({ title, imapOk, children }: Readonly<{ title: string; imapOk?: boolean; children: ReactNode }>) {
  const { t } = useTranslation()
  const { account } = useAccount()
  // A shared account is read-only: its archive only, even the overview (it reads Gmail)
  const shared = !!account?.shared_by
  if (shared || (account?.provider === 'imap' && !imapOk)) {
    return (
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
        <PageHeader title={t(title)} />
        <EmptyState
          icon={<Archive />}
          title={shared ? t('settings.share.archiveOnlyPage', { email: account.email, owner: account.shared_by }) : t('settings.imap.gmailOnlyPage', { email: account.email })}
          description={t(shared ? 'settings.share.archiveOnlyPageHint' : 'settings.imap.gmailOnlyPageHint')}
          action={(
            <Link to="/archives" className="inline-flex min-h-11 items-center font-medium text-primary-text underline">
              {t('settings.imap.openArchives')}
            </Link>
          )}
        />
      </div>
    )
  }
  if (!account || account.is_active) return <>{children}</>
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader title={t(title)} />
      <EmptyState
        icon={<Unplug />}
        title={t('settings.gmail.disconnectedPage', { email: account.email })}
        description={t('settings.gmail.disconnectedPageHint')}
        action={(
          <Link to="/settings/gmail" className="inline-flex min-h-11 items-center font-medium text-primary-text underline">
            {t('settings.gmail.reconnectInSettings')}
          </Link>
        )}
      />
    </div>
  )
}
