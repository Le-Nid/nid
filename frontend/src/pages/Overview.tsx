import { useEffect, useId, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Activity, Users } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState } from '@/components/app/EmptyState'
import { LoadError } from '@/components/app/LoadError'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { useAccount } from '@/hooks/useAccount'
import { useDashboardArchiveStats, useDashboardStats, useJobs, useNewsletters, useRuleStats } from '@/hooks/queries'
import type { LiveCounters } from '@/hooks/useLiveCounters'
import { useAuthStore } from '@/store/auth.store'
import { formatBytes, formatRelative, formatSender } from '@/utils/format'
import { Suggestions } from './overview/Suggestions'

type Sender = { sender: string; count: number; sizeBytes: number }
type Job = { id: string; bullmq_id: string | null; type: string }

const TOP = 5

/** undefined = still loading (skeleton); '—' = loaded without a figure. */
function kpiValue(v: number | undefined, loaded: boolean, n: Intl.NumberFormat) {
  if (v !== undefined) return n.format(v)
  return loaded ? '—' : undefined
}

/** Whole card = one link; its accessible name is label + value + hint (§5.2 KpiCard). */
function KpiCard({ to, label, value, hint, progress }: Readonly<{
  to: string
  label: string
  value: ReactNode
  hint?: string
  progress?: number
}>) {
  return (
    <Link
      to={to}
      className="flex min-h-11 flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value ?? <Skeleton className="h-8 w-20" />}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {progress !== undefined && (
        <span aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
          <span className="block h-full bg-progress" style={{ width: `${progress}%` }} />
        </span>
      )}
    </Link>
  )
}

function Section({ title, to, children }: Readonly<{ title: string; to: string; children: ReactNode }>) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="text-base font-semibold">{title}</h2>
        <Link to={to} className="inline-flex min-h-11 items-center text-sm font-medium text-primary-text underline-offset-4 hover:underline md:min-h-0">
          {t('overview.seeAll')}<span className="sr-only"> : {title}</span>
        </Link>
      </div>
      {children}
    </section>
  )
}

/** Top encombreurs: CSS bars with the figures as text, no chart library. */
function TopSenders({ senders }: Readonly<{ senders: Sender[] }>) {
  const { t } = useTranslation()
  if (!senders.length) return <EmptyState icon={<Users />} title={t('overview.top.empty')} />
  const top = [...senders].sort((a, b) => b.count - a.count).slice(0, TOP)
  const max = top[0].count || 1
  return (
    <ol className="flex flex-col gap-3">
      {top.map((s) => (
        <li key={s.sender} className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate font-medium">{formatSender(s.sender)}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {t('overview.top.value', { count: s.count, size: formatBytes(s.sizeBytes) })}
            </span>
          </div>
          <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(s.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  )
}

function ActiveJobs({ activeJobs }: Readonly<{ activeJobs?: number }>) {
  const { t } = useTranslation()
  const jobs = useJobs({ status: 'active' })
  // The SSE counter moves when a job starts or ends: refresh the list then
  useEffect(() => {
    if (activeJobs !== undefined) void jobs.refetch()
  }, [activeJobs]) // eslint-disable-line react-hooks/exhaustive-deps -- refetch is stable enough, the count is the trigger

  if (jobs.isError) return <LoadError message={t('overview.jobs.loadError')} onRetry={() => void jobs.refetch()} />
  if (jobs.isLoading) return <Skeleton className="h-12 w-full" />
  const list: Job[] = jobs.data ?? []
  if (!list.length) return <EmptyState icon={<Activity />} title={t('overview.jobs.empty')} />
  return (
    <ul className="flex flex-col gap-4">
      {list.map((j) => (
        <li key={j.id}>
          <JobProgressInline
            jobId={j.bullmq_id ?? j.id}
            label={t(`jobs.${j.type.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}`, { defaultValue: j.type })}
            onDone={() => void jobs.refetch()}
          />
        </li>
      ))}
    </ul>
  )
}

/** /overview (§7.1, artboards 9–10): the account in 5 s and the next useful action. */
export default function OverviewPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { accountId, account } = useAccount()
  // AppShell's live counters (B3); null until the first frame, then they win over the cached figures
  const counters = useOutletContext<LiveCounters | null>()
  const stats = useDashboardStats(accountId)
  const archive = useDashboardArchiveStats(accountId).data
  const scan = useNewsletters(accountId).data
  const rules = useRuleStats(accountId).data

  const name = user?.display_name || user?.email.split('@')[0] || ''
  const greeting = t('overview.greeting', { name })
  if (!accountId) {
    return (
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
        <PageHeader title={greeting} />
        <EmptyState
          title={t('overview.noAccount')}
          action={<Link to="/settings/account" className="inline-flex min-h-11 items-center font-medium text-primary-text underline">{t('overview.connectAccount')}</Link>}
        />
      </div>
    )
  }

  const n = new Intl.NumberFormat(i18n.language)
  const live = counters?.mails[accountId]
  const mails: number | undefined = typeof live === 'number' ? live : stats.data?.totalMessages
  const archived = archive ? Number(archive.total_mails ?? 0) : undefined
  const coverage = mails && archived !== undefined ? Math.min(100, Math.round((archived / mails) * 100)) : undefined
  const senders: { totalSizeBytes: number }[] = scan?.senders ?? []
  const activeRules = counters?.activeRules ?? rules?.active
  const backup = archive?.last_archived_at
    ? t('archives.status.last', { when: formatRelative(archive.last_archived_at, i18n.language) })
    : t('archives.status.never')

  const recoverable = scan?.scannedAt ? formatBytes(senders.reduce((sum, s) => sum + s.totalSizeBytes, 0)) : '—'

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader title={greeting} description={[account?.email, archive && backup].filter(Boolean).join(' · ')} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          to="/mails"
          label={t('overview.kpi.mails')}
          value={kpiValue(mails, !stats.isLoading, n)}
          hint={stats.data ? t('overview.kpi.unread', { count: stats.data.unreadCount ?? 0 }) : undefined}
        />
        <KpiCard
          to="/cleanup"
          label={t('overview.kpi.recoverable')}
          value={scan ? recoverable : undefined}
          hint={scan && t(scan.scannedAt ? 'overview.kpi.recoverableHint' : 'overview.kpi.notScanned', { count: senders.length })}
        />
        <KpiCard
          to="/archives"
          label={t('overview.kpi.backup')}
          value={coverage === undefined ? kpiValue(undefined, !!archive, n) : new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(coverage / 100)}
          hint={archived === undefined ? undefined : t('archives.status.count', { count: archived })}
          progress={coverage}
        />
        <KpiCard
          to="/rules"
          label={t('overview.kpi.rules')}
          value={kpiValue(activeRules, !!rules, n)}
          hint={rules && t('overview.kpi.rulesHint', { count: rules.processed30d })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title={t('overview.top.title')} to="/cleanup">
          {stats.isError && <LoadError message={t('overview.top.loadError')} onRetry={() => void stats.refetch()} />}
          {stats.isLoading && <Skeleton className="h-40 w-full" />}
          {stats.data && <TopSenders senders={stats.data.bySender ?? []} />}
        </Section>
        <Section title={t('overview.suggestions.title')} to="/cleanup">
          <Suggestions accountId={accountId} />
        </Section>
      </div>

      <Section title={t('overview.jobs.title')} to="/activity">
        <ActiveJobs activeJobs={counters?.activeJobs} />
      </Section>
    </div>
  )
}
