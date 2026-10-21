import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable, type RowSelectionState } from '@tanstack/react-table'
import { Download, HardDriveDownload, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { BulkActionBar, type BulkAction } from '@/components/app/BulkActionBar'
import { EmptyState } from '@/components/app/EmptyState'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { attachmentsApi } from '@/api'
import { queryKeys, useArchivedAttachments, useLiveAttachments } from '@/hooks/queries'
import { useMailActions, type MailAction } from '@/hooks/useMailActions'
import { formatBytes, formatSender } from '@/utils/format'

type Source = 'live' | 'archived'
/** One attachment of either source; `messageId` (Gmail) is what the mail actions act on. */
type Row = { id: string; messageId: string | null; filename: string; size: number; subject: string; sender: string; date: string; href: string }

type LiveAttachment = { messageId: string; filename: string; sizeBytes: number; mailSubject: string; mailSender: string; mailDate: string }
type ArchivedAttachment = { id: string; filename: string; size_bytes: number | string; mail_subject: string | null; mail_sender: string | null; mail_date: string | null }

const LIVE_PARAMS = { maxResults: 200 }
// shortcut: the 100 largest archived attachments, no paging or search; the legacy /attachments page keeps both until Admin takes dedup (O15)
const ARCHIVED_PARAMS = { page: 1, limit: 100, sort: 'size', order: 'desc' }

function toRows(accountId: string, source: Source, live?: LiveAttachment[], archived?: ArchivedAttachment[]): Row[] {
  if (source === 'live') {
    return (live ?? []).map((a) => ({
      id: `${a.messageId}/${a.filename}`, messageId: a.messageId, filename: a.filename, size: a.sizeBytes,
      subject: a.mailSubject, sender: a.mailSender, date: a.mailDate,
      href: attachmentsApi.downloadLiveUrl(accountId, a.messageId, a.filename),
    }))
  }
  return (archived ?? []).map((a) => ({
    id: a.id, messageId: null, filename: a.filename, size: Number(a.size_bytes),
    subject: a.mail_subject ?? '', sender: a.mail_sender ?? '', date: a.mail_date ?? '',
    href: attachmentsApi.downloadArchivedUrl(accountId, a.id),
  }))
}

function DateCell({ value }: Readonly<{ value: string }>) {
  const { i18n } = useTranslation()
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return <>—</>
  return <>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(date)}</>
}

const col = createColumnHelper<typeof dataListFeatures, Row>()

function buildColumns(t: TFunction) {
  return col.columns([
    col.accessor('filename', {
      header: t('cleanup.large.col.file'),
      meta: { mobile: 'title' },
      cell: ({ getValue }) => <span className="block max-w-72 truncate font-medium">{getValue()}</span>,
    }),
    col.accessor('subject', {
      header: t('cleanup.large.col.mail'),
      meta: { mobile: 'subtitle' },
      cell: ({ row }) => (
        <span className="flex max-w-80 min-w-0 flex-col">
          <span className="truncate">{row.original.subject || t('mails.noSubject')}</span>
          <span className="truncate text-xs text-muted-foreground">{formatSender(row.original.sender)}</span>
        </span>
      ),
    }),
    col.accessor('size', {
      header: t('cleanup.large.col.size'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatBytes(getValue())}</span>,
    }),
    col.accessor('date', { header: t('cleanup.large.col.date'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
    col.display({
      id: 'download',
      header: () => <span className="sr-only">{t('common.actions')}</span>,
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="icon" className="size-11 md:size-8">
          <a href={row.original.href} download={row.original.filename} aria-label={t('cleanup.large.download', { name: row.original.filename })}>
            <Download aria-hidden="true" />
          </a>
        </Button>
      ),
    }),
  ])
}

/** « Gros mails & pièces jointes » (§7.3): largest attachments, Gmail or archives; Gmail rows can be saved to the NAS or trashed (D1). */
export function LargeTab({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const source: Source = params.get('source') === 'archived' ? 'archived' : 'live'
  const live = useLiveAttachments(source === 'live' ? accountId : null, LIVE_PARAMS)
  const archived = useArchivedAttachments(source === 'archived' ? accountId : null, ARCHIVED_PARAMS)
  const query = source === 'live' ? live : archived
  const { pending, run, done } = useMailActions(accountId, (id) => queryKeys.attachments.live(id, LIVE_PARAMS))
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const hidden = useMemo(() => new Set(pending.flatMap((p) => p.hidden)), [pending])
  const rows = useMemo(
    () => toRows(accountId, source, live.data?.attachments, archived.data?.attachments).filter((r) => !r.messageId || !hidden.has(r.messageId)),
    [accountId, source, live.data, archived.data, hidden],
  )
  const columns = useMemo(() => buildColumns(t), [t])
  const table = useTable({
    features: dataListFeatures,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    enableRowSelection: source === 'live', // archived attachments are already off Gmail: download only
    enableSorting: false, // the server sorts by size
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
  })

  const setSource = (next: Source) => {
    setRowSelection({})
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      if (next === 'archived') out.set('source', next)
      else out.delete('source')
      return out
    }, { replace: true })
  }

  // A mail with several attachments is one target
  const selectedMails = [...new Set(rows.filter((r) => rowSelection[r.id]).map((r) => r.messageId!))]
  const act = (action: MailAction) => {
    void run(action, { ids: selectedMails }, { count: selectedMails.length, hidden: selectedMails })
    setRowSelection({})
  }
  const actions: BulkAction[] = [
    { label: t('mails.action.archive_nas'), icon: <HardDriveDownload aria-hidden="true" />, onSelect: () => act('archive_nas') },
    { label: t('mails.action.trash'), icon: <Trash2 aria-hidden="true" />, onSelect: () => act('trash'), destructive: true },
  ]
  const total: number = query.data?.totalSizeBytes ?? 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label={t('cleanup.large.source')} className="flex items-center gap-1">
          {(['live', 'archived'] as Source[]).map((key) => (
            <Button key={key} variant={source === key ? 'secondary' : 'ghost'} aria-pressed={source === key} className="h-11 md:h-8" onClick={() => setSource(key)}>
              {t(`cleanup.large.${key}`)}
            </Button>
          ))}
        </div>
        {query.data && (
          <p className="text-sm text-muted-foreground md:ml-auto">
            {t('cleanup.large.summary', { count: rows.length, size: formatBytes(total) })}
          </p>
        )}
      </div>

      {pending.map((p) => p.jobId && <JobProgressInline key={p.key} jobId={p.jobId} label={p.label} onDone={(job) => void done(p, job)} />)}

      <BulkActionBar count={selectedMails.length} mode="ids" actions={actions} onClear={() => setRowSelection({})} />

      {query.isError ? (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
          <span className="flex-1">{t('cleanup.large.loadError')}</span>
          <Button variant="outline" onClick={() => void query.refetch()}>{t('mails.retry')}</Button>
        </div>
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.filename}
          isLoading={query.isLoading}
          empty={<EmptyState icon={<Paperclip />} title={t('cleanup.large.empty')} description={t(`cleanup.large.emptyDescription.${source}`)} />}
        />
      )}
    </div>
  )
}
