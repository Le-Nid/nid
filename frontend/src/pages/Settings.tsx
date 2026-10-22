import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/app/PageHeader'
import { PageTabs } from '@/components/app/PageTabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { AccountSection } from './settings/AccountSection'
import { SecuritySection } from './settings/SecuritySection'
import { GmailSection } from './settings/GmailSection'
import { NotificationsSection } from './settings/NotificationsSection'
import { DataSection } from './settings/DataSection'
import { SETTINGS_SECTIONS, type SettingsSection } from './settings/shared'

const CONTENT: Record<SettingsSection, () => ReactNode> = {
  account: () => <AccountSection />,
  security: () => <SecuritySection />,
  gmail: () => <GmailSection />,
  notifications: () => <NotificationsSection />,
  data: () => <DataSection />,
}

/**
 * /settings/:section (§7.7, artboards 16–17). Desktop: section tabs at the top, content in cards.
 * Mobile: each section is a page of its own, reached from « Plus » (/more), with a way back there.
 */
export default function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const section = useParams().section as SettingsSection
  if (!SETTINGS_SECTIONS.includes(section)) return <Navigate to="/settings/account" replace />

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      {isMobile ? (
        <>
          <Link to="/more" className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 px-2 text-sm font-medium text-primary-text">
            <ChevronLeft className="size-4" aria-hidden="true" />{t('shell.more')}
          </Link>
          <PageHeader title={t(`settings.section.${section}`)} />
          {CONTENT[section]()}
        </>
      ) : (
        <>
          <PageHeader title={t('settings.title')} />
          <PageTabs
            value={section}
            onChange={(next) => navigate(`/settings/${next}`)}
            label={t('settings.sectionsLabel')}
            tabs={SETTINGS_SECTIONS.map((key) => ({ key, label: t(`settings.section.${key}`), content: CONTENT[key]() }))}
          />
        </>
      )}
    </div>
  )
}
