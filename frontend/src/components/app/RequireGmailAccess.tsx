import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Unplug } from 'lucide-react'
import { useAccount } from '@/hooks/useAccount'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'

/**
 * Pages that act on Gmail (Vue d'ensemble, Mails, Nettoyage, Règles): a disconnected account (soft disconnect)
 * has no Gmail access, so they offer the reconnection instead of failing on every call. Archives stays available.
 */
export function RequireGmailAccess({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  const { t } = useTranslation()
  const { account } = useAccount()
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
