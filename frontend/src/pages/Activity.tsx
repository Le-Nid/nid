import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { EmptyState } from '@/components/app/EmptyState'
import { FormField } from '@/components/app/FormField'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { LoadError } from '@/components/app/LoadError'
import { PageHeader } from '@/components/app/PageHeader'
import { useActivity, useCancelJob, useRetryJob } from '@/hooks/queries'
import { useAccount } from '@/hooks/useAccount'
import type { LiveCounters } from '@/hooks/useLiveCounters'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'
import { formatRelative, jobTypeKey } from '@/utils/format'

type Status = 'scheduled' | 'pending' | 'active' | 'completed' | 'failed' | 'cancelled'
type Job = {
  id: string
  bullmq_id: string | null
  type: string
  status: Status
  processed: number
  account_id: string | null
  payload: { ruleId?: string; senderEmail?: string; query?: string; retryOf?: string } | null
  error: string | null
  created_at: string
  completed_at: string | null
}
type Row = Job & { label: string; context: string }

// §7.6 chips → statuses sent to GET /api/jobs (« En attente » = delayed + queued)
const CHIPS = {
  all: [],
  waiting: ['scheduled', 'pending'],
  active: ['active'],
  failed: ['failed'],
  completed: ['completed'],
} as const satisfies Record<string, Status[]>
type Chip = keyof typeof CHIPS
const PAGE = 50

/** Page a finished job's result lives on; other types open the details. */
const RESULT_PAGE: Record<string, string> = {
  bulk_operation: '/mails',
  run_rule: '/rules',
  scan_unsubscribe: '/cleanup',
  archive_mails: '/archives',
  import_mbox: '/archives',
  import_imap: '/archives',
  apply_retention: '/archives?tab=retention',
  purge_archive_trash: '/archives?tab=trash',
}

const STATUS_CLASS: Partial<Record<Status, string>> = {
  active: 'bg-primary-soft text-primary-text',
  failed: 'bg-destructive-soft text-destructive',
}

function origin(job: Job, t: TFunction) {
  const p = job.payload
  if (p?.retryOf) return t('activity.origin.retry')
  if (p?.ruleId) return t('activity.origin.rule')
  if (p?.senderEmail) return t('activity.origin.sender', { sender: p.senderEmail })
  if (p?.query) return t('activity.origin.query', { query: p.query })
  return null
}

function duration(job: Job, locale: string) {
  if (!job.completed_at) return '—'
  const s = Math.max(0, Math.round((Date.parse(job.completed_at) - Date.parse(job.created_at)) / 1000))
  const unit = (value: number, u: 'second' | 'minute' | 'hour') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' }).format(value)
  if (s < 60) return unit(s, 'second')
  if (s < 3600) return unit(Math.round(s / 60), 'minute')
  return unit(Math.round(s / 360) / 10, 'hour')
}

function Result({ job, onDone }: Readonly<{ job: Row; onDone: () => void }>) {
  const { t } = useTranslation()
  if (job.status === 'active') return <JobProgressInline jobId={job.bullmq_id ?? job.id} label={job.label} onDone={onDone} />
  if (job.status === 'failed') return <span className="line-clamp-2 text-destructive">{job.error ?? t('jobs.failed')}</span>
  if (job.status === 'completed') return <>{t('jobProgress.completed', { count: job.processed })}</>
  if (job.status === 'cancelled') return <>{t('jobProgress.cancelled')}</>
  return <>{t('jobProgress.waiting')}</>
}

function Actions({ job, onDetails }: Readonly<{ job: Row; onDetails: (job: Row) => void }>) {
  const { t } = useTranslation()
  const cancel = useCancelJob()
  const retry = useRetryJob()
  const target = <span className="sr-only"> : {job.label}</span>
  const cls = 'h-11 md:h-8'

  const doRetry = () => retry.mutateAsync(job.id).then(
    () => toast.success(t('activity.retried')),
    (err) => toast.error(t(isAxiosError(err) && err.response?.status === 409 ? 'activity.retryCredentials' : 'activity.retryFailed')),
  )
  const details = <Button variant="ghost" className={cls} onClick={() => onDetails(job)}>{t('activity.action.details')}{target}</Button>

  if (job.status === 'scheduled' || job.status === 'pending') {
    return (
      <Button variant="outline" className={cls} disabled={cancel.isPending}
        onClick={() => void cancel.mutateAsync(job.id).catch(() => toast.error(t('activity.cancelFailed')))}>
        {t('activity.action.cancel')}{target}
      </Button>
    )
  }
  if (job.status === 'failed') {
    return (
      <div className="flex gap-1">
        <Button variant="outline" className={cls} disabled={retry.isPending} onClick={() => void doRetry()}>{t('activity.action.retry')}{target}</Button>
        {details}
      </div>
    )
  }
  if (job.status === 'completed') {
    const to = RESULT_PAGE[job.type]
    if (!to) return details
    return <Button asChild variant="ghost" className={cls}><Link to={to}>{t('activity.action.view')}{target}</Link></Button>
  }
  return null // active: « Arrêter » sits in its progress bar; cancelled: nothing left to do
}

const col = createColumnHelper<typeof dataListFeatures, Row>()

function buildColumns(t: TFunction, locale: string, onDone: () => void, onDetails: (job: Row) => void) {
  return col.columns([
    col.accessor('label', {
      header: t('activity.col.task'),
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.label}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{row.original.context}</span>
        </span>
      ),
    }),
    col.accessor('status', {
      header: t('activity.col.status'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => (
        <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', STATUS_CLASS[getValue()] ?? 'bg-muted text-muted-foreground')}>
          {t(`jobs.${getValue()}`)}
        </span>
      ),
    }),
    col.display({
      id: 'result',
      header: t('activity.col.progress'),
      meta: { mobile: 'subtitle' },
      cell: ({ row }) => <div className="min-w-48 text-sm"><Result job={row.original} onDone={onDone} /></div>,
    }),
    col.display({
      id: 'duration',
      header: t('activity.col.duration'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{duration(row.original, locale)}</span>,
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">{t('common.actions')}</span>,
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => <Actions job={row.original} onDetails={onDetails} />,
    }),
  ])
}

/** /activity (§7.6, artboards 14–15): every job you and your rules started, live, with the action its status allows. */
export default function ActivityPage() {
  const { t, i18n } = useTranslation()
  const accountSelectId = useId()
  const { accountId: current } = useAccount()
  const accounts = useAuthStore((s) => s.gmailAccounts)
  const counters = useOutletContext<LiveCounters | null>()
  const [params, setParams] = useSearchParams()
  const account = params.get('account') ?? current ?? 'all'
  const status = params.get('status')
  const chip: Chip = status && Object.hasOwn(CHIPS, status) ? (status as Chip) : 'all'
  const [limit, setLimit] = useState(PAGE)
  const [details, setDetails] = useState<Row | null>(null)

  const query = useActivity({
    accountId: account === 'all' ? undefined : account,
    status: CHIPS[chip].join(',') || undefined,
    limit,
  })
  const { refetch } = query
  // The SSE counter moves when a job starts or ends: refresh the list then
  useEffect(() => {
    if (counters) void refetch()
  }, [counters?.activeJobs]) // eslint-disable-line react-hooks/exhaustive-deps -- the count is the trigger

  const setParam = (key: string, value: string) => {
    setLimit(PAGE)
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      out.set(key, value)
      return out
    }, { replace: true })
  }

  const counts: Partial<Record<Status, number>> = query.data?.counts ?? {}
  const countOf = (c: Chip) => c === 'all'
    ? Object.values(counts).reduce((n, v) => n + (v ?? 0), 0)
    : CHIPS[c].reduce((n, s) => n + (counts[s] ?? 0), 0)

  const emails = useMemo(() => new Map(accounts.map((a) => [a.id, a.email])), [accounts])
  const rows: Row[] = useMemo(() => (query.data?.jobs ?? []).map((job: Job) => ({
    ...job,
    label: t(jobTypeKey(job.type), { defaultValue: job.type }),
    context: [
      job.account_id ? emails.get(job.account_id) : t('activity.system'),
      origin(job, t),
      formatRelative(job.created_at, i18n.language),
    ].filter(Boolean).join(' · '),
  })), [query.data, emails, t, i18n.language])

  const columns = useMemo(() => buildColumns(t, i18n.language, () => void refetch(), setDetails), [t, i18n.language, refetch])
  const table = useTable({ features: dataListFeatures, columns, data: rows, getRowId: (r) => r.id, enableSorting: false })
  const total = countOf(chip)

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader title={t('activity.title')} description={t('activity.description')} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div role="group" aria-label={t('activity.filterLabel')} className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {(Object.keys(CHIPS) as Chip[]).map((key) => (
            <Button
              key={key}
              variant={chip === key ? 'secondary' : 'ghost'}
              aria-pressed={chip === key}
              className="h-11 shrink-0 rounded-full md:h-8"
              onClick={() => setParam('status', key)}
            >
              {t(`activity.chip.${key}`)}
              {query.data && <span className="tabular-nums text-muted-foreground">{countOf(key)}</span>}
            </Button>
          ))}
        </div>
        <FormField id={accountSelectId} label={t('activity.account')}>
          <select
            id={accountSelectId}
            value={account}
            onChange={(e) => setParam('account', e.target.value)}
            className="h-11 rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm"
          >
            <option value="all">{t('activity.allAccounts')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        </FormField>
      </div>

      {query.isError ? (
        <LoadError message={t('activity.loadError')} onRetry={() => void refetch()} />
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.label}
          isLoading={query.isLoading}
          empty={<EmptyState icon={<Activity />} title={t('activity.empty')} description={t('activity.emptyDescription')} />}
        />
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>{t('activity.footer', { count: rows.length, total })}</p>
          {rows.length < total && (
            <Button variant="outline" className="h-11 md:h-9" disabled={query.isFetching} onClick={() => setLimit((n) => n + PAGE)}>
              {t('activity.more')}
            </Button>
          )}
        </div>
      )}

      <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{details?.label}</DialogTitle>
            <DialogDescription>
              {details && `${t(`jobs.${details.status}`)} · ${t('activity.details.started', { when: formatRelative(details.created_at, i18n.language) })}`}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
            {details?.error ?? t('activity.details.noError')}
          </pre>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" className="h-11 md:h-9">{t('common.close')}</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
