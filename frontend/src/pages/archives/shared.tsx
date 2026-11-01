import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Paperclip } from 'lucide-react'
import { dataListFeatures } from '@/components/app/DataList'
import { showUndoToast } from '@/components/app/UndoToast'
import { useExportMbox, useRestoreToMailbox, useTrashArchived, useRestoreArchived } from '@/hooks/queries'
import { saveBlob } from '@/utils/download'
import { formatBytes, formatSender } from '@/utils/format'

/** A row of `GET /api/archive/:id/mails` (or `/trash`); `highlight` only when searching with `q` (B2). */
export type ArchivedMail = {
  id: string
  subject: string | null
  sender: string | null
  date: string | null
  size_bytes: number | string
  has_attachments: boolean
  snippet: string | null
  tags?: string[]
  deleted_at?: string | null
  highlight?: string
  /** With `q`: the attachment whose text matched (PDF/DOCX), its excerpt as <mark>-only HTML. */
  attachment_match?: { filename: string; highlight: string } | null
}

const DEBOUNCE_MS = 300

/** Text typed in a field reaches the URL once the typing pauses; a change from elsewhere (clear) shows up. */
export function useDebounced(value: string, commit: (next: string) => void) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  // The latest commit: react-router's functional setSearchParams reads the params of the render it comes from
  const commitRef = useRef(commit)
  commitRef.current = commit
  // Our own commit coming back must not overwrite what was typed since
  const lastCommit = useRef(value)
  if (value !== synced) {
    setSynced(value)
    if (value !== lastCommit.current) setDraft(value)
  }
  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => {
      lastCommit.current = draft
      commitRef.current(draft)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps -- restarts on typing only
  return [draft, setDraft] as const
}

const FILTERS = ['q', 'sender', 'from', 'to', 'att', 'label', 'tag', 'smin', 'smax', 'atype'] as const
const MB = 1024 * 1024 // formatBytes' Mo
const mbToBytes = (mb: string) => (mb.trim() !== '' && Number(mb) >= 0 ? String(Math.round(Number(mb) * MB)) : undefined)
export type Filters = Record<(typeof FILTERS)[number], string>

/** Search and filters of the archive list, in the URL (§3.3) so a search can be shared and survives back. */
export function useArchiveFilters() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? ''])) as Filters
  // A new object each render is fine: React Query hashes its key
  const apiParams: Record<string, string> = {}
  if (filters.q) apiParams.q = filters.q
  if (filters.sender) apiParams.sender = filters.sender
  if (filters.from) apiParams.from_date = filters.from
  if (filters.to) apiParams.to_date = `${filters.to}T23:59:59.999Z` // the whole last day
  if (filters.att) apiParams.has_attachments = 'true'
  if (filters.label) apiParams.label = filters.label
  if (filters.tag) apiParams.tag = filters.tag
  const [sizeMin, sizeMax] = [mbToBytes(filters.smin), mbToBytes(filters.smax)]
  if (sizeMin) apiParams.size_min = sizeMin
  if (sizeMax) apiParams.size_max = sizeMax
  if (filters.atype.trim()) apiParams.attachment_type = filters.atype.trim()
  // Quick successive changes (typing, then a checkbox) must not drop each other: navigation is async, so
  // each write starts from the previous write rather than from the params of the render it comes from
  const latest = useRef(params)
  // Only a new location replaces it: a render in between two writes (still the old params) must not undo the first
  const routed = useRef(params)
  if (params !== routed.current) {
    routed.current = params
    latest.current = params
  }
  const set = (patch: Partial<Filters>) => {
    const out = new URLSearchParams(latest.current)
    for (const [k, v] of Object.entries(patch)) {
      if (v) out.set(k, v)
      else out.delete(k)
    }
    latest.current = out
    setParams(out, { replace: true })
  }
  return { filters, apiParams, set, filtered: Object.keys(apiParams).length > 0 }
}

/** « Restaurer dans la boîte mail » (job, Gmail or IMAP): the mails go back to the mailbox; the bell says when it is done. */
export function useRestoreToMailboxAction(accountId: string) {
  const { t } = useTranslation()
  const restore = useRestoreToMailbox(accountId)
  const run = (mailIds: string[]) => restore.mutate(mailIds, {
    onSuccess: () => toast.success(t('archives.restore.started', { count: mailIds.length }), { description: t('archives.restore.startedHint') }),
    onError: () => toast.error(t('archives.restore.failed')),
  })
  return { run, isPending: restore.isPending }
}

/** « Exporter (.mbox) »: the given mails, or the whole archive without ids. */
export function useMboxExport(accountId: string) {
  const { t } = useTranslation()
  const exportMbox = useExportMbox(accountId)
  const run = (mailIds?: string[]) =>
    exportMbox.mutate(mailIds, {
      onSuccess: (blob: Blob) => saveBlob(blob, `nid-archives-${new Date().toISOString().slice(0, 10)}.mbox`),
      onError: () => toast.error(t('archives.exportFailed')),
    })
  return { run, isPending: exportMbox.isPending }
}

/**
 * « Supprimer » (§6.3): the archive trash is reversible, so the move happens at once and « Annuler » restores.
 * (A client-side 10 s wait silently dropped the deletion when the tab closed.)
 */
export function useArchiveTrashWithUndo(accountId: string) {
  const { t } = useTranslation()
  const trash = useTrashArchived(accountId)
  const restore = useRestoreArchived(accountId)
  const run = (ids: string[]) => trash.mutate(ids, {
    onError: () => toast.error(t('archives.trashFailed')),
    onSuccess: () => showUndoToast({
      message: t('archives.trashToast', { count: ids.length }),
      description: t('archives.trashDescription'),
      onUndo: () => restore.mutate(ids, { onError: () => toast.error(t('mails.undoFailed')) }),
    }),
  })
  return { run }
}

export function DateCell({ value }: Readonly<{ value: string | null | undefined }>) {
  const { i18n } = useTranslation()
  if (!value) return <>—</>
  return <span className="whitespace-nowrap">{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(value))}</span>
}

export const col = createColumnHelper<typeof dataListFeatures, ArchivedMail>()

/** Columns both archive lists show (results, trash). */
export function mailColumns(t: TFunction) {
  return {
    subject: col.accessor('subject', {
      header: t('archives.col.subject'),
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <span className="block max-w-80 truncate">
          {row.original.has_attachments && <Paperclip role="img" aria-label={t('mails.attachment')} className="mr-1 inline size-3.5 align-[-2px]" />}
          {row.original.subject || t('mails.noSubject')}
        </span>
      ),
    }),
    sender: col.accessor('sender', {
      header: t('archives.col.sender'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => <span className="block max-w-48 truncate">{formatSender(getValue() ?? '')}</span>,
    }),
    size: col.accessor('size_bytes', {
      header: t('archives.col.size'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatBytes(Number(getValue()))}</span>,
    }),
  }
}

export const actionsHeader = (t: TFunction) => () => <span className="sr-only">{t('common.actions')}</span>
