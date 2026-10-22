import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PanelLeft, Search } from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import type { LiveCounters } from '@/hooks/useLiveCounters'
import { badgeClass, isActive, navBadge, visibleNav, type NavEntry } from './nav'

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent)

export default function AppSidebar({ onSearch, counters }: Readonly<{ onSearch: () => void; counters: LiveCounters | null }>) {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { state, toggleSidebar } = useSidebar()
  const { user, gmailAccounts, activeAccountId, setActiveAccount } = useAuthStore()
  const dark = useThemeStore((s) => s.mode) === 'dark'
  const collapsed = state === 'collapsed'
  const entries = visibleNav(user?.role)

  const item = (e: NavEntry) => {
    const label = t(`shell.${e.key}`)
    const active = isActive(e, pathname)
    const badge = navBadge(e.key, counters, activeAccountId, t, i18n.language)
    return (
      <SidebarMenuItem key={e.key}>
        <SidebarMenuButton asChild isActive={active} tooltip={label}>
          <Link to={e.to} aria-current={active ? 'page' : undefined}>
            <e.icon aria-hidden="true" />
            <span>{label}</span>
            {/* Inside the link so it is read with the entry name ("Mails 48 212") */}
            {badge && <span className={`${badgeClass(badge.accent)} group-data-[collapsible=icon]:hidden`}>{badge.text}</span>}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-10 items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          {!collapsed && (
            <img src={dark ? '/nid-logo-full-dark.svg' : '/nid-logo-full-light.svg'} alt="Nid" className="h-7 w-auto pl-2" />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}
            aria-expanded={!collapsed}
          >
            <PanelLeft aria-hidden="true" />
          </Button>
        </div>

        {!collapsed && gmailAccounts.length > 0 && (
          <div className="flex flex-col gap-1 px-2">
            <label htmlFor="shell-account" className="text-xs text-muted-foreground">{t('layout.gmailAccount')}</label>
            {/* shortcut: native select until AccountSwitcher (§5.2, with "Tous les comptes") lands in L3 */}
            <select
              id="shell-account"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={activeAccountId ?? ''}
              onChange={(e) => setActiveAccount(e.target.value)}
            >
              {gmailAccounts.map((a) => <option key={a.id} value={a.id}>{a.is_active ? a.email : t('settings.gmail.disconnectedOption', { email: a.email })}</option>)}
            </select>
          </div>
        )}

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSearch} tooltip={t('shell.search')} aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}>
              <Search aria-hidden="true" />
              <span className="flex-1">{t('shell.search')}</span>
              <Kbd aria-hidden="true">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={t('shell.mainNav')}>
          <SidebarGroup>
            <SidebarMenu>{entries.filter((e) => !e.adminOnly).map(item)}</SidebarMenu>
          </SidebarGroup>
          {entries.some((e) => e.adminOnly) && (
            <SidebarGroup>
              <SidebarGroupLabel>{t('shell.administration')}</SidebarGroupLabel>
              <SidebarMenu>{entries.filter((e) => e.adminOnly).map(item)}</SidebarMenu>
            </SidebarGroup>
          )}
        </nav>
      </SidebarContent>
    </Sidebar>
  )
}
