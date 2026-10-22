import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { NAV, isActive, visibleNav } from './nav'

// N2: 4 destinations + "Plus" (§3.1). Labels at 12 px rather than 11 (O8).
const BAR = new Set(['overview', 'mails', 'cleanup', 'archives'])

/** Mobile bar; « Plus » opens the /more page (Outils, Paramètres, Administration, logout), lit for every page under it. */
export default function BottomNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const role = useAuthStore((s) => s.user?.role)
  const moreActive = pathname === '/more' || visibleNav(role).some((e) => !BAR.has(e.key) && isActive(e, pathname))

  const tab = 'flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs font-medium'
  const item = (to: string, active: boolean, icon: ReactNode, label: string) => (
    <li key={to}>
      <Link to={to} aria-current={active ? 'page' : undefined} className={cn(tab, active ? 'text-primary-text' : 'text-muted-foreground')}>
        {icon}
        {label}
      </Link>
    </li>
  )

  return (
    <nav
      aria-label={t('shell.mainNav')}
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[max(22px,env(safe-area-inset-bottom))]"
    >
      <ul className="grid grid-cols-5">
        {NAV.filter((e) => BAR.has(e.key)).map((e) =>
          item(e.to, isActive(e, pathname), <e.icon className="size-5" aria-hidden="true" />, t(e.key === 'overview' ? 'shell.home' : `shell.${e.key}`)))}
        {item('/more', moreActive, <Ellipsis className="size-5" aria-hidden="true" />, t('shell.more'))}
      </ul>
    </nav>
  )
}
