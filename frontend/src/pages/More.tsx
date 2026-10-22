import type { ReactNode } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Bell, ChevronRight, Database, LogOut, Mail, ShieldCheck, User, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/PageHeader'
import { NAV, badgeClass, navBadge } from '@/components/app/nav'
import type { LiveCounters } from '@/hooks/useLiveCounters'
import { useAuthStore } from '@/store/auth.store'
import { SETTINGS_SECTIONS, type SettingsSection } from './settings/shared'

const SECTION_ICONS: Record<SettingsSection, LucideIcon> = { account: User, security: ShieldCheck, gmail: Mail, notifications: Bell, data: Database }

type Row = { to: string; icon: LucideIcon; label: string; summary?: string; badge?: ReactNode }

function Group({ title, rows }: Readonly<{ title: string; rows: Row[] }>) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h2 className="px-1 text-xs font-medium text-muted-foreground uppercase">{title}</h2>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map((row) => (
          <li key={row.to}>
            <Link to={row.to} className="flex min-h-[52px] items-center gap-3 px-4 py-2 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset">
              <row.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base">{row.label}</span>
                {row.summary && <span className="truncate text-sm text-muted-foreground">{row.summary}</span>}
              </span>
              {row.badge}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** /more, the mobile « Plus » screen (§3.1, §7.7 artboard 17): tools, settings sections with a summary, admin, logout. */
export default function MorePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const counters = useOutletContext<LiveCounters | null>()
  const { user, gmailAccounts, activeAccountId, logout } = useAuthStore()
  const entry = (key: string) => NAV.find((e) => e.key === key)!
  const toolRow = (key: string): Row => {
    const badge = navBadge(key, counters, activeAccountId, t, i18n.language)
    return { to: entry(key).to, icon: entry(key).icon, label: t(`shell.${key}`), badge: badge && <span className={badgeClass(badge.accent)}>{badge.text}</span> }
  }

  const reauth = gmailAccounts.filter((a) => a.needs_reauth).length
  const summaries: Record<SettingsSection, string> = {
    account: user?.email ?? '',
    security: t(user?.totp_enabled ? 'settings.summary.twoFactorOn' : 'settings.summary.twoFactorOff'),
    gmail: reauth ? t('settings.summary.actionRequired', { count: reauth }) : t('settings.summary.accounts', { count: gmailAccounts.length }),
    notifications: t('settings.summary.notifications'),
    data: t('settings.summary.data'),
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 p-4 md:px-6 md:pt-8">
      <PageHeader title={t('shell.more')} />
      <Group title={t('shell.tools')} rows={[toolRow('rules'), toolRow('activity')]} />
      <Group
        title={t('shell.settings')}
        rows={SETTINGS_SECTIONS.map((key) => ({ to: `/settings/${key}`, icon: SECTION_ICONS[key], label: t(`settings.section.${key}`), summary: summaries[key] }))}
      />
      {user?.role === 'admin' && (
        <Group title={t('shell.administration')} rows={[{ to: '/admin', icon: entry('admin').icon, label: t('shell.admin'), summary: t('settings.summary.admin') }]} />
      )}
      <footer className="flex flex-col items-start gap-1 border-t pt-4">
        <p className="text-sm text-muted-foreground">{t('settings.signedInAs', { email: user?.email ?? '' })}</p>
        <Button
          variant="ghost"
          className="-ml-3 min-h-11 gap-3 px-3 text-base text-destructive"
          onClick={() => void logout().then(() => navigate('/login'))}
        >
          <LogOut className="size-5" aria-hidden="true" />{t('settings.logoutOfNid')}
        </Button>
      </footer>
    </div>
  )
}
