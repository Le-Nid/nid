import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { Download, Eye, File, FileArchive, FileImage, FileText, Paperclip, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { EmptyState } from '@/components/app/EmptyState'
import { LoadError } from '@/components/app/LoadError'
import { PageHeader } from '@/components/app/PageHeader'
import { attachmentsApi } from '@/api'
import { useAccount } from '@/hooks/useAccount'
import { useArchivedAttachments, useDedupBackfill, useDedupStats, useLiveAttachments } from '@/hooks/queries'
import { formatBytes, formatSender } from '@/utils/format'
import { Pager } from './admin/shared'

type Source = 'archived' | 'live'
type Row = { id: string; filename: string; mime: string | null; size: number; subject: string; sender: string; date: string; href: string; preview: string | null }

type ArchivedAttachment = { id: string; filename: string; mime_type: string | null; size_bytes: number | string; mail_subject: string | null; mail_sender: string | null; mail_date: string | null }
type LiveAttachment = { messageId: string; filename: string; mimeType: string; sizeBytes: number; mailSubject: string; mailSender: string; mailDate: string }

const PAGE_SIZE = 50
const LIVE_PARAMS = { maxResults: 200 }

const isPreviewable = (mime: string | null) => !!mime && (mime.startsWith('image/') || mime === 'application/pdf')

function fileIcon(mime: string | null) {
  if (mime?.startsWith('image/')) return FileImage
  if (mime === 'application/pdf') return FileText
  if (mime?.includes('zip') || mime?.includes('compressed')) return FileArchive
  return File
}

function FileIcon({ mime }: Readonly<{ mime: string | null }>) {
  const Icon = fileIcon(mime)
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
}

function toRows(accountId: string, source: Source, archived?: ArchivedAttachment[], live?: LiveAttachment[]): Row[] {
  if (source === 'live') {
    return (live ?? []).map((a) => ({
      id: `${a.messageId}/${a.filename}`, filename: a.filename, mime: a.mimeType, size: a.sizeBytes,
      subject: a.mailSubject, sender: a.mailSender, date: a.mailDate,
      href: attachmentsApi.downloadLiveUrl(accountId, a.messageId, a.filename),
      preview: isPreviewable(a.mimeType) ? attachmentsApi.downloadLiveUrl(accountId, a.messageId, a.filename, true) : null,
    }))
  }
  return (archived ?? []).map((a) => ({
    id: a.id, filename: a.filename, mime: a.mime_type, size: Number(a.size_bytes),
    subject: a.mail_subject ?? '', sender: a.mail_sender ?? '', date: a.mail_date ?? '',
    href: attachmentsApi.downloadArchivedUrl(accountId, a.id),
    preview: isPreviewable(a.mime_type) ? attachmentsApi.downloadArchivedUrl(accountId, a.id, true) : null,
  }))
}

function DateCell({ value }: Readonly<{ value: string }>) {
  const { i18n } = useTranslation()
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return <>—</>
  return <>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(date)}</>
}

const col = createColumnHelper<typeof dataListFeatures, Row>()
const ICON_BUTTON = 'size-11 md:size-8'

function buildColumns(t: TFunction) {
  return col.columns([
    col.accessor('filename', {
      header: t('attachments.filename'),
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <span className="flex max-w-72 min-w-0 items-center gap-2">
          <FileIcon mime={row.original.mime} />
          <span className="truncate font-medium">{row.original.filename}</span>
        </span>
      ),
    }),
    col.accessor('subject', {
      header: t('attachments.mail'),
      meta: { mobile: 'subtitle' },
      cell: ({ row }) => (
        <span className="flex max-w-80 min-w-0 flex-col">
          <span className="truncate">{row.original.subject || t('common.noSubject')}</span>
          <span className="truncate text-xs text-muted-foreground">{formatSender(row.original.sender)}</span>
        </span>
      ),
    }),
    col.accessor('size', {
      header: t('attachments.size'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatBytes(getValue())}</span>,
    }),
    col.accessor('date', { header: t('attachments.date'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
    col.accessor('mime', {
      header: t('attachments.type'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{getValue() || t('common.noData')}</span>,
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">{t('attachments.actions')}</span>,
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => (
        <span className="inline-flex">
          {row.original.preview && (
            <Button asChild variant="ghost" size="icon" className={ICON_BUTTON}>
              <a href={row.original.preview} target="_blank" rel="noopener noreferrer" aria-label={t('attachments.viewName', { name: row.original.filename })}>
                <Eye aria-hidden="true" />
              </a>
            </Button>
          )}
          <Button asChild variant="ghost" size="icon" className={ICON_BUTTON}>
            <a href={row.original.href} download={row.original.filename} aria-label={t('attachments.downloadName', { name: row.original.filename })}>
              <Download aria-hidden="true" />
            </a>
          </Button>
        </span>
      ),
    }),
  ])
}

function Stat({ label, value, children }: Readonly<{ label: string; value: string; children?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-3.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {children}
    </div>
  )
}

/** /attachments: archived attachments (server search and paging) or the largest Gmail ones (client paging), with dedup stats. Source, search and page in the URL (§3.3). */
export default function AttachmentsPage() {
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const [params, setParams] = useSearchParams()
  const source: Source = params.get('source') === 'live' ? 'live' : 'archived'
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState(q)

  const archived = useArchivedAttachments(source === 'archived' ? accountId : null, { page, limit: PAGE_SIZE, sort: 'size', order: 'desc', ...(q ? { q } : {}) })
  const live = useLiveAttachments(source === 'live' ? accountId : null, LIVE_PARAMS)
  const query = source === 'archived' ? archived : live
  const dedup = useDedupStats().data
  const backfill = useDedupBackfill()

  const all = useMemo(
    () => (accountId ? toRows(accountId, source, archived.data?.attachments, live.data?.attachments) : []),
    [accountId, source, archived.data, live.data],
  )
  // Gmail sends up to 200 at once: paged here; archives come one page at a time
  const rows = source === 'live' ? all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : all
  const total: number = source === 'archived' ? (archived.data?.total ?? 0) : all.length
  const totalSize: number = query.data?.totalSizeBytes ?? 0

  const columns = useMemo(() => buildColumns(t), [t])
  const table = useTable({ features: dataListFeatures, columns, data: rows, getRowId: (r) => r.id, enableSorting: false }) // sorted by size

  const update = (patch: Record<string, string>) =>
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v) out.set(k, v)
        else out.delete(k)
      }
      return out
    }, { replace: true })
  // The search only applies to archives: switching source drops it
  const setSource = (next: Source) => {
    setDraft('')
    update({ source: next === 'live' ? next : '', q: '', page: '' })
  }
  const search = (e: FormEvent) => {
    e.preventDefault()
    update({ q: draft.trim(), page: '' })
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader
        title={t('attachments.title')}
        actions={accountId && (
          <Button variant="outline" className="h-11 md:h-9" disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw aria-hidden="true" />{t('attachments.reload')}
          </Button>
        )}
      />
      {accountId ? (
        <>
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">{t('attachments.source')}</legend>
            {(['archived', 'live'] as Source[]).map((key) => (
              <Button key={key} variant={source === key ? 'secondary' : 'ghost'} aria-pressed={source === key} className="h-11 md:h-8" onClick={() => setSource(key)}>
                {t(`attachments.${key}`)}
              </Button>
            ))}
          </fieldset>

          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('attachments.totalAttachments')} value={total.toLocaleString()} />
            <Stat label={t('attachments.totalSize')} value={formatBytes(totalSize)} />
            <Stat label={t('attachments.source')} value={t(source === 'archived' ? 'attachments.sourceArchived' : 'attachments.sourceLive')} />
            <Stat label={t('attachments.dedupSaved')} value={formatBytes(dedup?.savedBytes ?? 0)}>
              {dedup && (
                <dd className="text-xs text-muted-foreground">
                  {t('attachments.dedupDetails', { duplicates: dedup.duplicateFiles, saved: formatBytes(dedup.savedBytes) })}
                </dd>
              )}
              {dedup && dedup.hashCoverage < 1 && (
                <dd>
                  <Button variant="link" size="sm" className="h-auto p-0" disabled={backfill.isPending} onClick={() => backfill.mutate()}>
                    {t('attachments.dedupBackfill')}
                  </Button>
                </dd>
              )}
            </Stat>
          </dl>

          {source === 'archived' && (
            <form role="search" onSubmit={search} className="flex max-w-md gap-2">
              <Input
                type="search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('attachments.searchPlaceholder')}
                aria-label={t('attachments.searchLabel')}
                className="h-11 md:h-9"
              />
              <Button type="submit" variant="outline" size="icon" className="size-11 shrink-0 md:size-9" aria-label={t('common.search')}>
                <Search aria-hidden="true" />
              </Button>
            </form>
          )}

          {query.isError ? (
            <LoadError message={t('attachments.loadError')} onRetry={() => void query.refetch()} />
          ) : (
            <DataList
              table={table}
              rowLabel={(row) => row.original.filename}
              isLoading={query.isLoading}
              empty={<EmptyState icon={<Paperclip />} title={t('attachments.noAttachment')} />}
            />
          )}
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={(p) => update({ page: p > 1 ? String(p) : '' })} />
        </>
      ) : (
        <EmptyState title={t('attachments.noAccount')} />
      )}
    </div>
  )
}
