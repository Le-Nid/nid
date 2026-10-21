import { useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Ellipsis, MailMinus, RefreshCw, ScanSearch, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { showUndoToast } from '@/components/app/UndoToast'
import { jobsApi, unsubscribeApi } from '@/api'
import { queryKeys, useNewsletters } from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import type { JobState } from '@/hooks/useJobSSE'
import { formatBytes, formatSender } from '@/utils/format'
import { cn } from '@/lib/utils'
import { SenderRuleSheet } from './SenderRuleSheet'

export type NewsletterSender = {
  sender: string
  email: string
  count: number
  totalSizeBytes: number
  unreadCount: number
  unsubscribeUrl: string | null
  unsubscribeMailto: string | null
  latestDate: string
}
type Sort = 'count' | 'size' | 'unread'
type SenderJob = { jobId: string | null; label: string }

const SORTS: Record<Sort, (s: NewsletterSender) => number> = {
  count: (s) => s.count,
  size: (s) => s.totalSizeBytes,
  unread: (s) => s.unreadCount,
}
const isSort = (v: string | null): v is Sort => !!v && v in SORTS
const unsubscribeTarget = (s: NewsletterSender) => s.unsubscribeUrl ?? s.unsubscribeMailto
const senderName = (s: NewsletterSender) => formatSender(s.sender) || s.email

/** Trash every mail of a sender with the 10 s undo (D1); the row shows the job until it ends. */
function useSenderCleanup(accountId: string | null) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [jobs, setJobs] = useState<Record<string, SenderJob>>({})
  const set = (email: string, job: SenderJob | null) =>
    setJobs((prev) => {
      const next = { ...prev }
      if (job) next[email] = job
      else delete next[email]
      return next
    })
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.unsubscribe(accountId!) })

  const clean = async (sender: NewsletterSender, unsubscribed: boolean) => {
    if (!accountId) return
    const label = t(unsubscribed ? 'cleanup.job.unsubscribed' : 'cleanup.job.deleteAll', { count: sender.count, sender: senderName(sender) })
    set(sender.email, { jobId: null, label })
    try {
      const res: { jobId?: string; count?: number } = await unsubscribeApi.deleteSender(accountId, sender.email)
      const jobId = res.jobId
      if (!jobId) {
        // Nothing left in Gmail: the server already dropped the sender from its cache
        set(sender.email, null)
        await refresh()
        return
      }
      set(sender.email, { jobId, label })
      showUndoToast({
        message: t('mails.job.trash', { count: res.count ?? sender.count }),
        description: t('mails.undoDescription.trash'),
        onUndo: () => void jobsApi.cancel(jobId).then(() => set(sender.email, null), () => toast.error(t('mails.undoFailed'))),
      })
    } catch {
      set(sender.email, null)
      toast.error(t('mails.actionFailed'))
    }
  }

  const done = async (email: string, job: JobState) => {
    if (job.status === 'failed') toast.error(t('mails.jobFailed'))
    // The worker drops the sender from the cached scan once its mails are trashed
    await refresh()
    set(email, null)
  }

  return { jobs, clean, done }
}

function Avatar({ name }: Readonly<{ name: string }>) {
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text uppercase">
      {name.replace(/^\W+/, '').charAt(0) || '?'}
    </span>
  )
}

/** D3: no List-Unsubscribe → disabled, but focusable so the reason can be read (tooltip ≥md, text in the sheet). */
function UnsubscribeUnavailable({ stacked, className }: Readonly<{ stacked: boolean; className: string }>) {
  const { t } = useTranslation()
  const id = useId()
  const button = (
    <Button variant="outline" aria-disabled="true" aria-describedby={id} className={cn(className, 'cursor-not-allowed opacity-50')}>
      <MailMinus aria-hidden="true" />{t('cleanup.action.unsubscribe')}
    </Button>
  )
  if (stacked) {
    return (
      <div className="flex flex-col gap-1">
        {button}
        <p id={id} className="text-xs text-muted-foreground">{t('cleanup.noUnsubscribe')}</p>
      </div>
    )
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{t('cleanup.noUnsubscribe')}</TooltipContent>
      </Tooltip>
      <span id={id} className="sr-only">{t('cleanup.noUnsubscribe')}</span>
    </>
  )
}

type Handlers = { unsubscribe: (s: NewsletterSender) => void; deleteAll: (s: NewsletterSender) => void; rule: (s: NewsletterSender) => void }

/** The three sender actions (§7.3): a row of buttons ≥md, a stack of 52 px buttons in the mobile sheet. */
function SenderActions({ sender, stacked, on }: Readonly<{ sender: NewsletterSender; stacked: boolean; on: Handlers }>) {
  const { t } = useTranslation()
  const cls = stacked ? 'h-13 w-full justify-start' : 'h-11 md:h-8'
  const name = senderName(sender)
  return (
    <div className={stacked ? 'flex flex-col gap-2' : 'flex justify-end gap-1.5'}>
      {unsubscribeTarget(sender) ? (
        <ConfirmDialog
          trigger={<Button variant="outline" className={cls}><MailMinus aria-hidden="true" />{t('cleanup.action.unsubscribe')}</Button>}
          title={t('cleanup.confirm.title', { sender: name })}
          description={t('cleanup.confirm.description', { count: sender.count })}
          confirmLabel={t('cleanup.confirm.action', { count: sender.count })}
          onConfirm={() => on.unsubscribe(sender)}
          destructive
        />
      ) : (
        <UnsubscribeUnavailable stacked={stacked} className={cls} />
      )}
      <Button variant="outline" className={cn(cls, 'text-destructive')} onClick={() => on.deleteAll(sender)}>
        <Trash2 aria-hidden="true" />{t('cleanup.action.deleteAll')}
      </Button>
      <Button variant="ghost" className={cls} onClick={() => on.rule(sender)}>
        <Zap aria-hidden="true" />{t('cleanup.action.rule')}
      </Button>
    </div>
  )
}

/** Row actions: inline ≥md, « ⋯ » opening the action sheet <md. */
function ActionsCell({ sender, busy, on, openSheet }: Readonly<{ sender: NewsletterSender; busy: boolean; on: Handlers; openSheet: (s: NewsletterSender) => void }>) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  if (busy) return null
  if (!isMobile) return <SenderActions sender={sender} stacked={false} on={on} />
  return (
    <Button variant="ghost" size="icon" className="size-11" aria-haspopup="dialog" aria-label={t('cleanup.senderActions', { sender: senderName(sender) })} onClick={() => openSheet(sender)}>
      <Ellipsis aria-hidden="true" />
    </Button>
  )
}

const col = createColumnHelper<typeof dataListFeatures, NewsletterSender>()

type Cells = {
  jobs: Record<string, SenderJob>
  done: (email: string, job: JobState) => void
  on: Handlers
  openSheet: (s: NewsletterSender) => void
}

function buildColumns(t: TFunction, cells: { current: Cells }) {
  return col.columns([
    col.accessor('sender', {
      header: t('cleanup.col.sender'),
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <Avatar name={senderName(row.original)} />
          <span className="truncate font-medium">{senderName(row.original)}</span>
        </span>
      ),
    }),
    col.accessor('email', {
      header: t('cleanup.col.email'),
      meta: { mobile: 'subtitle' },
      cell: ({ row }) => {
        const job = cells.current.jobs[row.original.email]
        if (job?.jobId) return <JobProgressInline jobId={job.jobId} label={job.label} onDone={(j) => cells.current.done(row.original.email, j)} />
        return <span className="block max-w-56 truncate text-muted-foreground">{job ? job.label : row.original.email}</span>
      },
    }),
    col.accessor('totalSizeBytes', {
      header: t('cleanup.col.size'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatBytes(getValue())}</span>,
    }),
    col.accessor('count', {
      header: t('cleanup.col.count'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{t('cleanup.mails', { count: getValue() })}</span>,
    }),
    col.accessor('unreadCount', {
      header: t('cleanup.col.unread'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{t('cleanup.unread', { count: getValue() })}</span>,
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">{t('common.actions')}</span>,
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => (
        <ActionsCell
          sender={row.original}
          busy={!!cells.current.jobs[row.original.email]}
          on={cells.current.on}
          openSheet={cells.current.openSheet}
        />
      ),
    }),
  ])
}

function ScanProgress({ jobId, onDone }: Readonly<{ jobId: string; onDone: (job: JobState) => void }>) {
  const { t } = useTranslation()
  return <JobProgressInline jobId={jobId} label={t('cleanup.scanning')} onDone={onDone} />
}

/** « Expéditeurs & newsletters » (§7.3, artboards 5–6): cached scan, sort, newsletters filter, per-sender cleanup. */
export function SendersTab({ accountId }: Readonly<{ accountId: string }>) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const sortParam = params.get('sort')
  const sort: Sort = isSort(sortParam) ? sortParam : 'count'
  const onlyNewsletters = params.get('only') === 'newsletters'
  const newsletters = useNewsletters(accountId)
  const { jobs, clean, done } = useSenderCleanup(accountId)
  const [scanJob, setScanJob] = useState<string | null>(null)
  const [sheetFor, setSheetFor] = useState<NewsletterSender | null>(null)
  const [ruleFor, setRuleFor] = useState<NewsletterSender | null>(null)
  const filterId = useId()

  const setParam = (key: string, value: string | null) =>
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      if (value) out.set(key, value)
      else out.delete(key)
      return out
    }, { replace: true })

  const senders: NewsletterSender[] = newsletters.data?.senders ?? []
  const rows = useMemo(
    () => senders.filter((s) => !onlyNewsletters || unsubscribeTarget(s)).sort((a, b) => SORTS[sort](b) - SORTS[sort](a)),
    [senders, onlyNewsletters, sort],
  )

  const on: Handlers = {
    unsubscribe: (s) => {
      // Opened within the click (popup blockers), before the delete is queued; unsubscribing itself cannot be undone (D2)
      window.open(unsubscribeTarget(s)!, '_blank', 'noopener,noreferrer')
      setSheetFor(null)
      void clean(s, true)
    },
    deleteAll: (s) => {
      setSheetFor(null)
      void clean(s, false)
    },
    rule: (s) => {
      setSheetFor(null)
      setRuleFor(s)
    },
  }
  // Columns stay stable; cells read the current jobs and handlers through this ref
  const cells = useRef<Cells>({ jobs, done, on, openSheet: setSheetFor })
  cells.current = { jobs, done: (email, job) => void done(email, job), on, openSheet: setSheetFor }
  const columns = useMemo(() => buildColumns(t, cells), [t])
  const table = useTable({
    features: dataListFeatures,
    columns,
    data: rows,
    getRowId: (s) => s.email,
    enableSorting: false, // sorted by the « Trier par » choice, the same on cards and table
  })

  const startScan = () =>
    unsubscribeApi.scanAsync(accountId).then(({ jobId }: { jobId: string }) => setScanJob(jobId), () => toast.error(t('cleanup.scanFailed')))
  const scanDone = async (job: JobState) => {
    if (job.status === 'failed') toast.error(t('cleanup.scanFailed'))
    await qc.invalidateQueries({ queryKey: queryKeys.unsubscribe(accountId) })
    setScanJob(null)
  }

  if (newsletters.isError) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
        <span className="flex-1">{t('cleanup.loadError')}</span>
        <Button variant="outline" onClick={() => void newsletters.refetch()}>{t('mails.retry')}</Button>
      </div>
    )
  }

  const scannedAt: string | null = newsletters.data?.scannedAt ?? null
  if (newsletters.data && !scannedAt) {
    return (
      <EmptyState
        icon={<ScanSearch />}
        title={t('cleanup.never.title')}
        description={t('cleanup.never.description')}
        action={scanJob ? <ScanProgress jobId={scanJob} onDone={(j) => void scanDone(j)} /> : (
          <Button onClick={() => void startScan()}><ScanSearch aria-hidden="true" />{t('cleanup.scan')}</Button>
        )}
      />
    )
  }

  const date = scannedAt && new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(scannedAt))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label={t('cleanup.sortLabel')} className="flex flex-wrap items-center gap-1">
          <span aria-hidden="true" className="mr-1 text-sm text-muted-foreground">{t('cleanup.sortLabel')}</span>
          {(Object.keys(SORTS) as Sort[]).map((key) => (
            <Button
              key={key}
              variant={sort === key ? 'secondary' : 'ghost'}
              aria-pressed={sort === key}
              className="h-11 md:h-8"
              onClick={() => setParam('sort', key === 'count' ? null : key)}
            >
              {t(`cleanup.sort.${key}`)}
            </Button>
          ))}
        </div>
        <div className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
          <Checkbox id={filterId} checked={onlyNewsletters} onCheckedChange={(v) => setParam('only', v ? 'newsletters' : null)} />
          <label htmlFor={filterId}>{t('cleanup.newslettersOnly')}</label>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground md:ml-auto">
          {date && <span>{t('cleanup.scannedAt', { date })}</span>}
          {!scanJob && (
            <Button variant="outline" className="h-11 md:h-8" onClick={() => void startScan()}>
              <RefreshCw aria-hidden="true" />{t('cleanup.rescan')}
            </Button>
          )}
        </div>
      </div>
      {scanJob && <ScanProgress jobId={scanJob} onDone={(j) => void scanDone(j)} />}

      <DataList
        table={table}
        rowLabel={(row) => senderName(row.original)}
        isLoading={newsletters.isLoading}
        empty={onlyNewsletters && senders.length > 0 ? (
          <EmptyState
            icon={<MailMinus />}
            title={t('cleanup.emptyNewsletters')}
            action={<Button variant="outline" onClick={() => setParam('only', null)}>{t('cleanup.showAllSenders')}</Button>}
          />
        ) : (
          <EmptyState icon={<MailMinus />} title={t('cleanup.empty')} description={t('cleanup.emptyDescription')} />
        )}
      />

      <Sheet open={!!sheetFor} onOpenChange={(open) => !open && setSheetFor(null)}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[90dvh] rounded-t-xl pb-[max(16px,env(safe-area-inset-bottom))]">
          {sheetFor && (
            <>
              <SheetHeader>
                <SheetTitle>{senderName(sheetFor)}</SheetTitle>
                <SheetDescription>{sheetFor.email} · {t('cleanup.mails', { count: sheetFor.count })} · {formatBytes(sheetFor.totalSizeBytes)}</SheetDescription>
              </SheetHeader>
              <div className="px-4">
                <SenderActions sender={sheetFor} stacked on={on} />
              </div>
              <Button variant="ghost" className="mx-4 h-13" onClick={() => setSheetFor(null)}>{t('common.close')}</Button>
            </>
          )}
        </SheetContent>
      </Sheet>

      <SenderRuleSheet accountId={accountId} sender={ruleFor} onClose={() => setRuleFor(null)} />
    </div>
  )
}
