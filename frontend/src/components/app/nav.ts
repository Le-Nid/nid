import {
  Activity, Archive, BrushCleaning, Inbox, LayoutDashboard, Shield, SlidersHorizontal, Zap, type LucideIcon,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import type { LiveCounters } from '@/hooks/useLiveCounters'

export interface NavEntry {
  key: string
  to: string
  icon: LucideIcon
  /** Path prefixes that light the entry up, legacy pages it absorbs included (§3.3). */
  match: string[]
  adminOnly?: boolean
}

// N1 (§3.1). `to` = the new route when it exists, else the legacy page until its lot lands.
export const NAV: NavEntry[] = [
  { key: 'overview', to: '/overview', icon: LayoutDashboard, match: ['/overview'] },
  { key: 'mails', to: '/mails', icon: Inbox, match: ['/mails', '/unified', '/saved-searches'] },
  { key: 'cleanup', to: '/cleanup', icon: BrushCleaning, match: ['/cleanup', '/unsubscribe', '/attachments'] },
  { key: 'rules', to: '/rules', icon: Zap, match: ['/rules', '/expiration'] },
  { key: 'archives', to: '/archives', icon: Archive, match: ['/archives'] },
  { key: 'activity', to: '/activity', icon: Activity, match: ['/activity'] },
  { key: 'settings', to: '/settings/account', icon: SlidersHorizontal, match: ['/settings', '/ops'] },
  { key: 'admin', to: '/admin', icon: Shield, match: ['/admin'], adminOnly: true },
]

/** Legacy pages without a nav entry of their own yet, reachable from the command palette. */
export const LEGACY_PAGES: { to: string; labelKey: string }[] = [
  { to: '/unified', labelKey: 'nav.unified' },
  { to: '/saved-searches', labelKey: 'nav.savedSearches' },
  { to: '/attachments', labelKey: 'nav.attachments' },
]

export const isActive = (entry: NavEntry, pathname: string) =>
  entry.match.some((p) => pathname === p || pathname.startsWith(p + '/'))

/** Live counter shown next to a nav entry (§3.1, D6). shortcut: no Nettoyage badge, the server does not send cleanupBytes yet. */
export function navBadge(
  key: string, counters: LiveCounters | null, accountId: string | null, t: TFunction, locale: string,
): { text: string; accent?: boolean } | null {
  if (!counters) return null
  const mails = accountId ? counters.mails[accountId] : null
  if (key === 'mails' && typeof mails === 'number') return { text: mails.toLocaleString(locale) }
  if (key === 'rules' && counters.activeRules > 0) return { text: String(counters.activeRules) }
  if (key === 'activity' && counters.activeJobs > 0) return { text: t('shell.activeJobs', { count: counters.activeJobs }), accent: true }
  return null
}

export const badgeClass = (accent?: boolean) =>
  `ml-auto rounded-md px-1.5 text-xs font-medium tabular-nums ${accent ? 'bg-primary-soft text-primary-text' : 'text-muted-foreground'}`

export const visibleNav =(role: string | undefined) => NAV.filter((e) => !e.adminOnly || role === 'admin')
