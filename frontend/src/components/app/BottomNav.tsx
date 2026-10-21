import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Ellipsis, LogOut, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import type { LiveCounters } from '@/hooks/useLiveCounters'
import { NAV, badgeClass, isActive, navBadge, visibleNav, type NavEntry } from './nav'

// N2: 4 destinations + "Plus" (§3.1). Labels at 12 px rather than 11 (O8).
const BAR = new Set(['overview', 'mails', 'cleanup', 'archives'])
const MORE_GROUPS = [
  { titleKey: 'shell.tools', keys: ['rules', 'activity'] },
  { titleKey: 'shell.settings', keys: ['settings'] },
  { titleKey: 'shell.administration', keys: ['admin'] },
]

export default function BottomNav({ counters }: Readonly<{ counters: LiveCounters | null }>) {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout, activeAccountId } = useAuthStore()
  const [moreOpen, setMoreOpen] = useState(false)
  const entries = visibleNav(user?.role)
  const moreActive = entries.some((e) => !BAR.has(e.key) && isActive(e, pathname))

  const tab = 'flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs font-medium'
  // Badges in the "Plus" sheet only: the 5-tab bar has no room for them
  const linkRow = (e: NavEntry) => {
    const active = isActive(e, pathname)
    const badge = navBadge(e.key, counters, activeAccountId, t, i18n.language)
    return (
      <li key={e.key}>
        <Link
          to={e.to}
          aria-current={active ? 'page' : undefined}
          onClick={() => setMoreOpen(false)}
          className={cn('flex min-h-[52px] items-center gap-3 rounded-lg px-3 text-base', active ? 'bg-primary-soft text-primary-text' : 'hover:bg-accent')}
        >
          <e.icon className="size-5" aria-hidden="true" />
          {t(`shell.${e.key}`)}
          {badge && <span className={badgeClass(badge.accent)}>{badge.text}</span>}
        </Link>
      </li>
    )
  }

  return (
    <nav
      aria-label={t('shell.mainNav')}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[max(22px,env(safe-area-inset-bottom))]"
    >
      <ul className="grid grid-cols-5">
        {NAV.filter((e) => BAR.has(e.key)).map((e) => {
          const active = isActive(e, pathname)
          return (
            <li key={e.key}>
              <Link to={e.to} aria-current={active ? 'page' : undefined} className={cn(tab, active ? 'text-primary-text' : 'text-muted-foreground')}>
                <e.icon className="size-5" aria-hidden="true" />
                {t(e.key === 'overview' ? 'shell.home' : `shell.${e.key}`)}
              </Link>
            </li>
          )
        })}
        <li>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            {/* Radix sets aria-haspopup="dialog" and aria-expanded on the trigger */}
            <SheetTrigger className={cn(tab, 'w-full', moreActive ? 'text-primary-text' : 'text-muted-foreground')}>
              <Ellipsis className="size-5" aria-hidden="true" />
              {t('shell.more')}
            </SheetTrigger>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              aria-describedby={undefined}
              className="max-h-[90dvh] gap-2 overflow-y-auto rounded-t-2xl p-5 pb-[max(22px,env(safe-area-inset-bottom))]"
            >
              <SheetHeader className="flex-row items-center justify-between p-0">
                <SheetTitle className="text-lg font-semibold">{t('shell.more')}</SheetTitle>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="size-11" aria-label={t('common.close')}>
                    <X aria-hidden="true" />
                  </Button>
                </SheetClose>
              </SheetHeader>
              {MORE_GROUPS.map((g) => {
                const items = entries.filter((e) => g.keys.includes(e.key))
                if (!items.length) return null
                return (
                  <section key={g.titleKey} aria-label={t(g.titleKey)}>
                    <h2 className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase">{t(g.titleKey)}</h2>
                    <ul>{items.map(linkRow)}</ul>
                  </section>
                )
              })}
              <Button
                variant="ghost"
                className="min-h-[52px] justify-start gap-3 px-3 text-base text-destructive"
                onClick={() => logout().then(() => navigate('/login'))}
              >
                <LogOut className="size-5" aria-hidden="true" />
                {t('shell.logout')}
              </Button>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}
