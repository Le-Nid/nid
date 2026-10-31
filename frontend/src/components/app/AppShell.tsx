import { useState, type CSSProperties } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LogOut, User } from 'lucide-react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { useGlobalJobNotifier } from '@/hooks/useGlobalJobNotifier'
import { useLiveCounters } from '@/hooks/useLiveCounters'
import { useAuthStore } from '@/store/auth.store'
import { accountLabel } from '@/hooks/useAccount'
import { useThemeStore } from '@/store/theme.store'
import AppSidebar from './AppSidebar'
import BottomNav from './BottomNav'
import CommandPalette from './CommandPalette'
import NotificationBell from './NotificationBell'

function UserMenu({ withAccounts }: Readonly<{ withAccounts: boolean }>) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, gmailAccounts, sharedAccounts, activeAccountId, setActiveAccount, logout } = useAuthStore()
  const accounts = [...gmailAccounts, ...sharedAccounts]
  const { mode, toggle } = useThemeStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Name from content, not aria-label: it must contain the visible user name (WCAG 2.5.3) */}
        <Button variant="ghost" className="h-11 gap-2 px-2 md:h-9">
          <span className="sr-only">{t('layout.userMenu')}</span>
          <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-avatar text-avatar-foreground">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" crossOrigin="anonymous" className="size-full object-cover" />
              : <User className="size-4" aria-hidden="true" />}
          </span>
          <span className="hidden max-w-48 truncate text-sm md:inline">{user?.display_name || user?.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
        {withAccounts && accounts.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('layout.gmailAccount')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={activeAccountId ?? ''} onValueChange={setActiveAccount}>
              {accounts.map((a) => <DropdownMenuRadioItem key={a.id} value={a.id}>{accountLabel(a, t)}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('shell.language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={i18n.language?.startsWith('en') ? 'en' : 'fr'} onValueChange={(l) => i18n.changeLanguage(l)}>
          <DropdownMenuRadioItem value="fr" lang="fr">Français</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en" lang="en">English</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={mode === 'dark'} onCheckedChange={toggle}>{t('shell.darkMode')}</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => logout().then(() => navigate('/login'))}>
          <LogOut aria-hidden="true" />
          {t('shell.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Layout of every authenticated page (§5.2): sidebar ≥md, bottom bar <md, ⌘K palette. */
export default function AppShell() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const dark = useThemeStore((s) => s.mode) === 'dark'
  const [paletteOpen, setPaletteOpen] = useState(false)
  const counters = useLiveCounters()
  const activeJobs = counters?.activeJobs ?? 0
  useGlobalJobNotifier()

  return (
    <TooltipProvider>
      <SidebarProvider style={{ '--sidebar-width': '15rem' } as CSSProperties}>
        {/* Only the running-jobs count is announced; the other counters change too often to be useful */}
        <p aria-live="polite" className="sr-only">{activeJobs ? `${t('shell.activity')} : ${t('shell.activeJobs', { count: activeJobs })}` : ''}</p>
        {!isMobile && <AppSidebar onSearch={() => setPaletteOpen(true)} counters={counters} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b bg-background px-3 pt-[env(safe-area-inset-top)] md:px-6">
            {isMobile && <img src={dark ? '/nid-logo-full-dark.svg' : '/nid-logo-full-light.svg'} alt="Nid" className="h-7 w-auto" />}
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <UserMenu withAccounts={isMobile} />
            </div>
          </header>
          {/* id kept for the skip link in index.html */}
          <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col pb-[calc(52px+max(22px,env(safe-area-inset-bottom)))] md:pb-0">
            {/* Pages read the live counters from here: one SSE connection per tab */}
            <Outlet context={counters} />
          </main>
        </div>
        {isMobile && <BottomNav />}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        {/* Mobile: above the bottom bar (52 px + safe area) */}
        <Toaster containerAriaLabel={t('undoToast.region')} mobileOffset={{ bottom: 'calc(60px + max(22px, env(safe-area-inset-bottom)))' }} />
      </SidebarProvider>
    </TooltipProvider>
  )
}
