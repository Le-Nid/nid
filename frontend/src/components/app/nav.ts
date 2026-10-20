import {
  Activity, Archive, BrushCleaning, Inbox, LayoutDashboard, Shield, SlidersHorizontal, Zap, type LucideIcon,
} from 'lucide-react'

export interface NavEntry {
  key: string
  to: string
  icon: LucideIcon
  /** Path prefixes that light the entry up, legacy pages it absorbs included (§3.3). */
  match: string[]
  adminOnly?: boolean
}

// N1 (§3.1). `to` = the new route when it exists, else the legacy page until its lot lands
// (Nettoyage → /unsubscribe until L6).
export const NAV: NavEntry[] = [
  { key: 'overview', to: '/overview', icon: LayoutDashboard, match: ['/overview', '/analytics', '/insights'] },
  { key: 'mails', to: '/mails', icon: Inbox, match: ['/mails', '/unified', '/saved-searches'] },
  { key: 'cleanup', to: '/unsubscribe', icon: BrushCleaning, match: ['/cleanup', '/unsubscribe', '/attachments'] },
  { key: 'rules', to: '/rules', icon: Zap, match: ['/rules', '/expiration'] },
  { key: 'archives', to: '/archives', icon: Archive, match: ['/archives', '/sharing'] },
  { key: 'activity', to: '/activity', icon: Activity, match: ['/activity'] },
  { key: 'settings', to: '/settings/account', icon: SlidersHorizontal, match: ['/settings', '/privacy', '/ops'] },
  { key: 'admin', to: '/admin', icon: Shield, match: ['/admin'], adminOnly: true },
]

/** Legacy pages without a nav entry of their own yet, reachable from the command palette. */
export const LEGACY_PAGES: { to: string; labelKey: string }[] = [
  { to: '/unified', labelKey: 'nav.unified' },
  { to: '/saved-searches', labelKey: 'nav.savedSearches' },
  { to: '/attachments', labelKey: 'nav.attachments' },
  { to: '/expiration', labelKey: 'nav.expiration' },
  { to: '/sharing', labelKey: 'nav.sharing' },
  { to: '/insights', labelKey: 'nav.insights' },
  { to: '/analytics', labelKey: 'nav.analytics' },
  { to: '/privacy', labelKey: 'nav.privacy' },
  { to: '/ops', labelKey: 'nav.ops' },
]

export const isActive = (entry: NavEntry, pathname: string) =>
  entry.match.some((p) => pathname === p || pathname.startsWith(p + '/'))

export const visibleNav = (role: string | undefined) => NAV.filter((e) => !e.adminOnly || role === 'admin')
