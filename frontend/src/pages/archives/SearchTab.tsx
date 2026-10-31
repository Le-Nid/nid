import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useTable, type RowSelectionState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { FileArchive, Download, ListFilter, Search, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { BulkActionBar, type BulkAction } from '@/components/app/BulkActionBar'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { FormField } from '@/components/app/FormField'
import { Highlight } from '@/components/app/Highlight'
import { LabelTree, labelTreeNodes, type LabelNode } from '@/components/app/LabelTree'
import { LoadError } from '@/components/app/LoadError'
import { MailViewer, type ArchiveViewerAction } from '@/components/app/MailViewer'
import { RowMenu } from '@/components/app/RowMenu'
import { useArchiveMails, useArchiveTags, useDashboardArchiveStats, useDeleteArchiveTag, useLabels } from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import type { ApiLabel } from '@/utils/gmail'
import { ShareDialog } from './ShareDialog'
import { TagDialog } from './TagDialog'
import {
  actionsHeader, col, DateCell, mailColumns, useArchiveFilters, useArchiveTrashWithUndo, useMboxExport,
  type ArchivedMail, type Filters,
} from './shared'

type RowAction = 'open' | ArchiveViewerAction
const ROW_ACTIONS: RowAction[] = ['open', 'share', 'trash']
const DEBOUNCE_MS = 300
const FIELD = 'h-11 text-base md:h-9 md:text-sm'

/** Text typed in a field reaches the URL once the typing pauses; a change from elsewhere (clear) shows up. */
function useDebounced(value: string, commit: (next: string) => void) {
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

/** The label or tag tree as a select, for the filters sheet <md. */
function TreeSelect({ id, label, nodes, value, onChange }: Readonly<{
  id: string; label: string; nodes: LabelNode[]; value: string; onChange: (value: string) => void
}>) {
  return (
    <FormField id={id} label={label}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-md border border-input bg-transparent px-3 text-base">
        {nodes.map((n) => (
          <option key={n.id ?? ''} value={n.id ?? ''}>
            {' '.repeat((n.level - 1) * 2)}{n.name}{n.count === undefined ? '' : ` (${n.count})`}
          </option>
        ))}
      </select>
    </FormField>
  )
}

/** Expéditeur, Période, Avec pièce jointe (§7.5); inline ≥md, in the filters sheet <md with the label and tag selects. */
function FilterFields({ filters, set, nodes, tagNodes }: Readonly<{
  filters: Filters; set: (patch: Partial<Filters>) => void; nodes?: LabelNode[]; tagNodes?: LabelNode[]
}>) {
  const { t } = useTranslation()
  const id = useId()
  const [sender, setSender] = useDebounced(filters.sender, (v) => set({ sender: v }))
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      {nodes && <TreeSelect id={`${id}-label`} label={t('archives.filter.label')} nodes={nodes} value={filters.label} onChange={(label) => set({ label })} />}
      {tagNodes && tagNodes.length > 1 && (
        <TreeSelect id={`${id}-tag`} label={t('archives.filter.tag')} nodes={tagNodes} value={filters.tag} onChange={(tag) => set({ tag })} />
      )}
      <FormField id={`${id}-sender`} label={t('archives.filter.sender')}>
        <Input id={`${id}-sender`} type="text" inputMode="email" autoComplete="off" value={sender} onChange={(e) => setSender(e.target.value)} className={FIELD} />
      </FormField>
      <FormField id={`${id}-from`} label={t('archives.filter.from')}>
        <Input id={`${id}-from`} type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} className={FIELD} />
      </FormField>
      <FormField id={`${id}-to`} label={t('archives.filter.to')}>
        <Input id={`${id}-to`} type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} className={FIELD} />
      </FormField>
      <div className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
        <Checkbox id={`${id}-att`} checked={!!filters.att} onCheckedChange={(v) => set({ att: v ? '1' : '' })} />
        <label htmlFor={`${id}-att`}>{t('archives.filter.attachments')}</label>
      </div>
    </div>
  )
}

function Extract({ mail }: Readonly<{ mail: ArchivedMail }>) {
  return (
    <span className="block max-w-96 text-muted-foreground md:line-clamp-2">
      {mail.highlight === undefined ? mail.snippet : <Highlight html={mail.highlight} />}
    </span>
  )
}

function buildColumns(t: TFunction, onRow: (action: RowAction, mail: ArchivedMail) => void) {
  const base = mailColumns(t)
  return col.columns([
    base.subject,
    col.accessor((m) => m.highlight ?? m.snippet ?? '', {
      id: 'extract',
      header: t('archives.col.extract'),
      meta: { mobile: 'subtitle', lines: 3 },
      cell: ({ row }) => <Extract mail={row.original} />,
    }),
    // First meta = the card's top-right corner (DataList)
    col.accessor('date', { header: t('archives.col.date'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
    base.sender,
    base.size,
    col.display({
      id: 'actions',
      header: actionsHeader(t),
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => (
        <RowMenu
          label={t('mails.rowActions', { subject: row.original.subject || t('mails.noSubject') })}
          items={ROW_ACTIONS.map((a) => ({
            key: a, label: t(`archives.action.${a}`), onSelect: () => onRow(a, row.original), destructive: a === 'trash',
          }))}
        />
      ),
    }),
  ])
}

/** « N résultats · 0,12 s » (§7.5). */
function ResultCount({ total, tookMs }: Readonly<{ total: number; tookMs?: number }>) {
  const { t, i18n } = useTranslation()
  const seconds = tookMs === undefined
    ? ''
    : ` · ${new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tookMs / 1000)} s`
  return <p aria-live="polite" className="text-sm text-muted-foreground">{t('archives.results', { count: total })}{seconds}</p>
}

/** Archive search (§7.5, artboards 7–8): label tree, full-text search and filters, highlighted results, reader. */
export function SearchTab({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { filters, apiParams, set, filtered } = useArchiveFilters()
  const labels: ApiLabel[] = useLabels(accountId).data ?? []
  const stats = useDashboardArchiveStats(accountId).data
  const nodes = labelTreeNodes(labels, t, stats ? Number(stats.total_mails) : undefined)
  const tags = useArchiveTags(accountId).data ?? []
  const tagNodes: LabelNode[] = [
    { id: null, name: t('archives.tags.all'), level: 1 },
    ...tags.map(({ tag, count }) => ({ id: tag, name: tag, level: 1, count })),
  ]
  const deleteTag = useDeleteArchiveTag(accountId)
  const search = useArchiveMails(accountId, apiParams)
  const exporter = useMboxExport(accountId)
  const trash = useArchiveTrashWithUndo(accountId)
  const [q, setQ] = useDebounced(filters.q, (v) => set({ q: v }))
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [viewing, setViewing] = useState<string | null>(null)
  const [sharing, setSharing] = useState<string | null>(null)
  const [tagging, setTagging] = useState<string[] | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // The selection belongs to one result list (§6.4)
  const scope = JSON.stringify(apiParams)
  const [prevScope, setPrevScope] = useState(scope)
  if (scope !== prevScope) {
    setPrevScope(scope)
    setRowSelection({})
  }

  const mails: ArchivedMail[] = useMemo(
    () => (search.data?.pages.flatMap((p) => p.mails as ArchivedMail[]) ?? []),
    [search.data],
  )
  const first = search.data?.pages[0]
  const subjectOf = (id: string | null) => mails.find((m) => m.id === id)?.subject || t('mails.noSubject')

  const act = (action: ArchiveViewerAction, id: string) => {
    if (action === 'share') return setSharing(id)
    setViewing(null)
    trash.run([id])
  }
  // Columns stay stable; the row menu reaches the current handlers through this ref
  const onRowRef = useRef<(action: RowAction, mail: ArchivedMail) => void>(() => {})
  onRowRef.current = (action, mail) => (action === 'open' ? setViewing(mail.id) : act(action, mail.id))
  const columns = useMemo(() => buildColumns(t, (a, m) => onRowRef.current(a, m)), [t])
  const table = useTable({
    features: dataListFeatures,
    columns,
    data: mails,
    getRowId: (m) => m.id,
    enableRowSelection: true,
    enableSorting: false, // relevance with `q`, else date
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
  })

  const selected = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const bulkActions: BulkAction[] = [
    { label: t('archives.export'), icon: <Download aria-hidden="true" />, onSelect: () => exporter.run(selected) },
    { label: t('archives.tags.title'), icon: <Tag aria-hidden="true" />, onSelect: () => setTagging(selected) },
    {
      label: t('archives.action.trash'),
      icon: <Trash2 aria-hidden="true" />,
      destructive: true,
      onSelect: () => {
        trash.run(selected)
        setRowSelection({})
      },
    },
  ]
  const activeFilters = [filters.sender, filters.from, filters.to, filters.att, filters.label, filters.tag].filter(Boolean).length
  const clearAll = () => set({ q: '', sender: '', from: '', to: '', att: '', label: '', tag: '' })
  const removeTag = (tag: string) => deleteTag.mutate(tag, {
    onSuccess: () => {
      set({ tag: '' })
      toast.success(t('archives.tags.deleted', { tag }))
    },
    onError: () => toast.error(t('archives.tags.failed')),
  })

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-6">
      {!isMobile && (
        <div className="flex flex-col gap-4">
          <LabelTree nodes={nodes} value={filters.label || null} onChange={(id) => set({ label: id ?? '' })} label={t('archives.labelTree')} />
          {tagNodes.length > 1 && (
            <LabelTree nodes={tagNodes} value={filters.tag || null} onChange={(id) => set({ tag: id ?? '' })} label={t('archives.tags.title')} />
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t('archives.search')}
              placeholder={t('archives.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-11 pl-9 text-base md:h-9 md:text-sm"
            />
          </div>
          {isMobile && (
            <Button variant="outline" className="h-11" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
              <ListFilter aria-hidden="true" />
              {activeFilters ? t('archives.filtersCount', { count: activeFilters }) : t('archives.filters')}
            </Button>
          )}
        </div>
        {!isMobile && <FilterFields filters={filters} set={set} />}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {first && <ResultCount total={first.total} tookMs={first.tookMs} />}
          {filters.tag && (
            <ConfirmDialog
              trigger={<Button variant="ghost" size="sm" className="h-11 text-destructive md:h-8">{t('archives.tags.delete', { tag: filters.tag })}</Button>}
              title={t('archives.tags.deleteTitle', { tag: filters.tag })}
              description={t('archives.tags.deleteDescription')}
              confirmLabel={t('archives.tags.deleteConfirm')}
              onConfirm={() => removeTag(filters.tag)}
              destructive
            />
          )}
        </div>

        <BulkActionBar count={selected.length} mode="ids" actions={bulkActions} onClear={() => setRowSelection({})} />

        {search.isError ? (
          <LoadError message={t('archives.loadError')} onRetry={() => void search.refetch()} />
        ) : (
          <DataList
            table={table}
            rowLabel={(row) => row.original.subject || t('mails.noSubject')}
            onRowOpen={(row) => setViewing(row.id)}
            isLoading={search.isLoading}
            empty={filtered ? (
              <EmptyState
                icon={<FileArchive />}
                title={t('archives.noMatch')}
                action={<Button variant="outline" onClick={clearAll}>{t('archives.clearFilters')}</Button>}
              />
            ) : (
              <EmptyState icon={<FileArchive />} title={t('archives.empty')} description={t('archives.emptyDescription')} />
            )}
          />
        )}

        {search.hasNextPage && (
          <Button variant="outline" className="h-11 self-center md:h-9" disabled={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
            {t('mails.loadMore')}
          </Button>
        )}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[90dvh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>{t('archives.filters')}</SheetTitle>
            <SheetDescription>{t('archives.filtersDescription')}</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4"><FilterFields filters={filters} set={set} nodes={nodes} tagNodes={tagNodes} /></div>
          <SheetFooter className="pb-[max(16px,env(safe-area-inset-bottom))]">
            <Button className="h-11" onClick={() => setFiltersOpen(false)}>{t('archives.showResults')}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <MailViewer
        source="archive"
        accountId={accountId}
        messageId={viewing}
        labels={labels}
        onClose={() => setViewing(null)}
        onOpenMail={setViewing}
        onAction={(action) => viewing && act(action, viewing)}
      />
      <TagDialog
        accountId={accountId}
        mailIds={tagging}
        onClose={() => setTagging(null)}
        onDone={() => { setTagging(null); setRowSelection({}) }}
      />
      <ShareDialog mailId={sharing} subject={subjectOf(sharing)} onClose={() => setSharing(null)} />
    </div>
  )
}
