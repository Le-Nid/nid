import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ListChecks, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { FormField } from '@/components/app/FormField'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { LoadError } from '@/components/app/LoadError'
import {
  useAdminJobs, useAdminQuota, useAdminSystem, useEmptyInstanceTrash, useRunIntegrityCheck, useUpdateTrashConfig,
} from '@/hooks/queries'
import { formatBytes, formatRelative } from '@/utils/format'
import { DateCell } from '../archives/shared'
import { Section, selectClass } from './shared'

/** `GET /api/admin/system` (B15). */
type SystemStatus = {
  trash: { count: number; sizeBytes: number; retentionDays: number; purgeEnabled: boolean; nextPurgeAt: string | null }
  integrity: { checkedAt: string; checkedFiles: number; missing: number; corrupted: number; orphaned: number; healthy: boolean } | null
}
type Quota = {
  day: { units: number; calls: number; limit: number }
  peakPerSecond: { units: number; account: string | null; limit: number }
  rateLimited24h: number
}
type AdminJob = { id: string; type: string; status: string; user_email: string; created_at: string }

const DURATIONS = [7, 30, 90]

function TrashSection({ trash, onChanged }: Readonly<{ trash: SystemStatus['trash']; onChanged: () => void }>) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const update = useUpdateTrashConfig()
  const empty = useEmptyInstanceTrash()
  const size = formatBytes(trash.sizeBytes)
  // A value set before this screen (e.g. 45 days) stays selectable
  const durations = DURATIONS.includes(trash.retentionDays) ? DURATIONS : [...DURATIONS, trash.retentionDays].sort((a, b) => a - b)
  const purge = trash.nextPurgeAt
    ? t('admin.system.trash.nextPurge', { date: new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(new Date(trash.nextPurgeAt)) })
    : !trash.purgeEnabled && t('admin.system.trash.purgeOff')

  const setDuration = (retentionDays: number) => update.mutate({ retentionDays }, {
    onSuccess: () => {
      toast.success(t('admin.system.trash.saved'))
      onChanged()
    },
    onError: () => toast.error(t('admin.system.trash.saveFailed')),
  })

  return (
    <Section title={t('admin.system.trash.title')}>
      <p className="text-sm">{[t('admin.system.trash.volume', { count: trash.count, size }), purge].filter(Boolean).join(' · ')}</p>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <FormField id={`${id}-days`} label={t('admin.system.trash.maxDuration')}>
          <select id={`${id}-days`} value={trash.retentionDays} disabled={update.isPending} onChange={(e) => setDuration(Number(e.target.value))} className={`${selectClass} w-40`}>
            {durations.map((d) => <option key={d} value={d}>{t('admin.system.trash.days', { count: d })}</option>)}
          </select>
        </FormField>
        {trash.count > 0 && (
          <ConfirmDialog
            trigger={<Button variant="outline" className="h-11 text-destructive md:h-9"><Trash2 aria-hidden="true" />{t('admin.system.trash.empty')}</Button>}
            title={t('admin.system.trash.confirmTitle')}
            description={t('admin.system.trash.confirmDescription', { count: trash.count, size })}
            confirmLabel={t('admin.system.trash.confirm')}
            destructive
            onConfirm={() => empty.mutate(undefined, {
              onSuccess: ({ deleted }: { deleted: number }) => toast.success(t('admin.system.trash.emptied', { count: deleted })),
              onError: () => toast.error(t('admin.system.trash.emptyFailed')),
            })}
          />
        )}
      </div>
    </Section>
  )
}

function IntegritySection({ integrity, onDone }: Readonly<{ integrity: SystemStatus['integrity']; onDone: () => void }>) {
  const { t, i18n } = useTranslation()
  const run = useRunIntegrityCheck()
  const [job, setJob] = useState<string | null>(null)
  const start = () => run.mutate(undefined, {
    onSuccess: ({ jobId }: { jobId: string }) => setJob(jobId),
    onError: () => toast.error(t('admin.system.integrity.failed')),
  })

  return (
    <Section
      title={t('admin.system.integrity.title')}
      description={t('admin.system.integrity.schedule')}
      actions={<Button variant="outline" className="h-11 md:h-9" disabled={!!job || run.isPending} onClick={start}><ShieldCheck aria-hidden="true" />{t('admin.system.integrity.run')}</Button>}
    >
      {integrity ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className={integrity.healthy ? 'font-medium text-success' : 'font-medium text-destructive'}>
            {integrity.healthy ? t('admin.system.integrity.healthy') : t('admin.system.integrity.unhealthy', { missing: integrity.missing, corrupted: integrity.corrupted })}
          </p>
          <p className="text-muted-foreground">{t('admin.system.integrity.last', { when: formatRelative(integrity.checkedAt, i18n.language), count: integrity.checkedFiles })}</p>
          {integrity.orphaned > 0 && <p className="text-muted-foreground">{t('admin.system.integrity.orphaned', { count: integrity.orphaned })}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('admin.system.integrity.never')}</p>
      )}
      {job && (
        <JobProgressInline
          jobId={job}
          label={t('admin.system.integrity.running')}
          onDone={() => {
            setJob(null)
            onDone()
          }}
        />
      )}
    </Section>
  )
}

function QuotaSection() {
  const { t, i18n } = useTranslation()
  const query = useAdminQuota()
  const quota: Quota | undefined = query.data
  const n = (v: number) => v.toLocaleString(i18n.language)
  let body
  if (query.isError) body = <LoadError message={t('admin.system.quota.loadError')} onRetry={() => void query.refetch()} />
  else if (!quota) body = <Skeleton className="h-16 w-full" />
  else {
    const stats: [string, string, string | null][] = [
      [t('admin.system.quota.day'), `${n(quota.day.units)} / ${n(quota.day.limit)}`, null],
      [t('admin.system.quota.peak'), t('admin.system.quota.perSecond', { units: n(quota.peakPerSecond.units), limit: n(quota.peakPerSecond.limit) }), quota.peakPerSecond.account],
      [t('admin.system.quota.rateLimited'), n(quota.rateLimited24h), null],
    ]
    body = (
      <dl className="grid gap-3 md:grid-cols-3">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            {hint && <dd className="truncate text-xs text-muted-foreground">{hint}</dd>}
          </div>
        ))}
      </dl>
    )
  }
  return <Section title={t('admin.system.quota.title')} description={t('admin.system.quota.description')}>{body}</Section>
}

const jobCol = createColumnHelper<typeof dataListFeatures, AdminJob>()
const jobColumns = (t: TFunction) => jobCol.columns([
  jobCol.accessor('type', { header: t('admin.system.jobs.col.type'), meta: { mobile: 'title' }, cell: ({ getValue }) => <code className="text-sm">{getValue()}</code> }),
  jobCol.accessor('user_email', { header: t('admin.system.jobs.col.user'), meta: { mobile: 'subtitle' } }),
  jobCol.accessor('status', { header: t('admin.system.jobs.col.status'), meta: { mobile: 'meta' }, cell: ({ getValue }) => t(`admin.system.jobs.status.${getValue()}`, { defaultValue: getValue() }) }),
  jobCol.accessor('created_at', { header: t('admin.system.jobs.col.created'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
])
const JOBS_PARAMS = { page: 1, limit: 20 }

/** Jobs of every user (O15): the 20 latest, read-only; cancelling stays in each user's Activité. */
function JobsSection() {
  const { t } = useTranslation()
  const query = useAdminJobs(JOBS_PARAMS)
  const columns = useMemo(() => jobColumns(t), [t])
  const jobs: AdminJob[] = query.data?.jobs ?? []
  const table = useTable({ features: dataListFeatures, columns, data: jobs, getRowId: (j) => j.id, enableSorting: false })
  return (
    <Section title={t('admin.system.jobs.title')} description={t('admin.system.jobs.description')}>
      {query.isError ? (
        <LoadError message={t('admin.system.jobs.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.type}
          isLoading={query.isLoading}
          empty={<EmptyState icon={<ListChecks />} title={t('admin.system.jobs.empty')} />}
        />
      )}
    </Section>
  )
}

/** « Système » (§7.8): instance trash, archive integrity, Gmail API quota, everyone's jobs. */
export function SystemTab() {
  const { t } = useTranslation()
  const system = useAdminSystem()
  const status: SystemStatus | undefined = system.data
  const refetch = () => void system.refetch()
  // shortcut: no versions footer (Nid, PostgreSQL, Redis, worker concurrency), no endpoint exposes them; add one to /api/admin/system
  // shortcut: no attachment dedup section (O15), its endpoints are per user, not instance-wide
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('admin.system.description')}</p>
      {system.isError && <LoadError message={t('admin.system.loadError')} onRetry={refetch} />}
      {!status && !system.isError && <Skeleton className="h-32 w-full" />}
      {status && <TrashSection trash={status.trash} onChanged={refetch} />}
      {status && <IntegritySection integrity={status.integrity} onDone={refetch} />}
      <QuotaSection />
      <JobsSection />
    </div>
  )
}
