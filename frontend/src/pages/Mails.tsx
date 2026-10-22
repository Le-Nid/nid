import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable, type RowSelectionState, type Updater } from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  Archive, HardDriveDownload, Inbox, MailCheck, MailOpen, Paperclip, RefreshCw, Tag, Trash2, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { RowMenu } from '@/components/app/RowMenu'
import { FormField } from '@/components/app/FormField'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { BulkActionBar, type BulkAction } from '@/components/app/BulkActionBar'
import { SearchBar, type SavedSearch } from '@/components/app/SearchBar'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState } from '@/components/app/EmptyState'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { LabelBadge } from '@/components/app/LabelBadge'
import { MailViewer, type ViewerAction } from '@/components/app/MailViewer'
import { RuleSheet, type RuleSheetTarget } from '@/components/app/RuleSheet'
import { useAccount } from '@/hooks/useAccount'
import { useCreateSavedSearch, useGmailMessages, useLabels, useSavedSearches, useUnifiedMessages } from '@/hooks/queries'
import { useKeyboardShortcuts, useShortcutsPref } from '@/hooks/useKeyboardShortcuts'
import { useMailActions, type MailAction, type Target } from '@/hooks/useMailActions'
import { formatBytes, formatEmail, formatSender } from '@/utils/format'
import { toBadge, type ApiLabel } from '@/utils/gmail'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

type Mail = {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  sizeEstimate: number
  snippet: string
  labelIds: string[]
  hasAttachments: boolean
  // « Tous les comptes » only (GET /api/unified/messages)
  accountId?: string
  accountEmail?: string
}
type RowAction = 'open' | ViewerAction
const ROW_ACTIONS: RowAction[] = ['open', 'archive', 'archive_nas', 'trash']
// §7.2 chips; the query is plain Gmail syntax, so a chip is a saved search the user cannot delete
const QUICK: [key: string, query: string][] = [
  ['all', ''], ['unread', 'is:unread'], ['attachments', 'has:attachment'], ['large', 'larger:10m'],
  ['promotions', 'category:promotions older_than:6m'], ['social', 'category:social'], ['old', 'older_than:1y'],
  ['spam', 'in:spam'], ['trash', 'in:trash'],
]
// A search that is just one sender (« from:x@y.fr ») prefills « Créer une règle »
const searchSender = (q: string) => /^from:(\S+)$/.exec(q.trim())?.[1]

function SenderCell({ mail }: Readonly<{ mail: Mail }>) {
  const { t } = useTranslation()
  const unread = mail.labelIds.includes('UNREAD')
  return (
    <span className={cn('block max-w-48 truncate', unread ? 'font-semibold' : 'font-normal')}>
      {formatSender(mail.from)}
      {unread && <span className="sr-only"> ({t('mails.unread')})</span>}
    </span>
  )
}

function SubjectCell({ mail }: Readonly<{ mail: Mail }>) {
  const { t } = useTranslation()
  return (
    <span className="flex max-w-[32rem] min-w-0 flex-col">
      <span className={cn('truncate text-foreground', mail.labelIds.includes('UNREAD') && 'font-semibold')}>
        {mail.hasAttachments && <Paperclip role="img" aria-label={t('mails.attachment')} className="mr-1 inline size-3.5 align-[-2px]" />}
        {mail.subject || t('mails.noSubject')}
      </span>
      <span className="truncate text-xs text-muted-foreground">{mail.snippet}</span>
    </span>
  )
}

function DateCell({ value }: Readonly<{ value: string }>) {
  const { i18n } = useTranslation()
  if (!value) return <>—</>
  const date = new Date(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return <>{new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' }).format(date)}</>
}

function MailMenu({ mail, onRow }: Readonly<{ mail: Mail; onRow: (action: RowAction, mail: Mail) => void }>) {
  const { t } = useTranslation()
  return (
    <RowMenu
      label={t('mails.rowActions', { subject: mail.subject || t('mails.noSubject') })}
      items={ROW_ACTIONS.map((a) => ({ key: a, label: t(`mails.action.${a}`), onSelect: () => onRow(a, mail), destructive: a === 'trash' }))}
    />
  )
}

const col = createColumnHelper<typeof dataListFeatures, Mail>()

function buildColumns(t: TFunction, labels: ApiLabel[], onRow: (action: RowAction, mail: Mail) => void, accountId: string | null, allMode: boolean) {
  return col.columns([
    col.accessor('from', { header: t('mails.col.from'), meta: { mobile: 'title' }, cell: ({ row }) => <SenderCell mail={row.original} /> }),
    col.accessor('subject', { header: t('mails.col.subject'), meta: { mobile: 'subtitle' }, cell: ({ row }) => <SubjectCell mail={row.original} /> }),
    // Before the other metas: the first one is the card's top-right corner (DataList)
    col.accessor('date', { header: t('mails.col.date'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
    col.accessor('labelIds', {
      header: t('mails.col.labels'),
      meta: { mobile: 'meta' },
      cell: ({ getValue, row }) => (
        <span className="flex flex-wrap gap-1">
          {getValue()
            // Only the current account's user labels (Label_*) are loaded: hide the other accounts' raw ids
            .filter((id) => (row.original.accountId ?? accountId) === accountId || !id.startsWith('Label_'))
            .map((id) => <LabelBadge key={id} label={toBadge(labels, id)} />)}
        </span>
      ),
    }),
    ...(allMode
      ? [col.accessor((m) => m.accountEmail ?? '', {
          id: 'account',
          header: t('mails.col.account'),
          meta: { mobile: 'meta' },
          cell: ({ getValue }) => <span className="block max-w-48 truncate text-xs text-muted-foreground">{getValue()}</span>,
        })]
      : []),
    col.accessor('sizeEstimate', {
      header: t('mails.col.size'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatBytes(getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">{t('common.actions')}</span>,
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => <MailMenu mail={row.original} onRow={onRow} />,
    }),
  ])
}

function LabelPicker({ open, onOpenChange, labels, onPick }: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  labels: ApiLabel[]
  onPick: (labelId: string) => void
}>) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('mails.labelPicker')}</DialogTitle>
          <DialogDescription>{t('mails.labelPickerDescription')}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {labels.map((l) => (
            <li key={l.id}>
              <Button variant="ghost" className="h-11 w-full justify-start md:h-9" onClick={() => onPick(l.id)}>
                <LabelBadge label={toBadge(labels, l.id)} />
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">{t('common.cancel')}</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShortcutsHint({ on, onToggle }: Readonly<{ on: boolean; onToggle: () => void }>) {
  const { t } = useTranslation()
  return (
    <p className="hidden text-center text-xs text-muted-foreground md:block">
      {on ? t('mails.shortcutsHint') : t('mails.shortcutsOff')}{' '}
      <Button variant="link" className="h-6 p-0 text-xs text-primary-text" onClick={onToggle}>
        {on ? t('mails.shortcutsDisable') : t('mails.shortcutsEnable')}
      </Button>
    </p>
  )
}

/** Mails of one account (Gmail pages) or of every account (« Tous les comptes », one request). */
function useMailList(allMode: boolean, accountId: string | null, q: string) {
  const messages = useGmailMessages(allMode ? null : accountId, q, '')
  const unified = useUnifiedMessages({ q: q || undefined, maxResults: 50 }, allMode)
  const loaded: Mail[] = useMemo(
    () => (allMode ? (unified.data?.messages as Mail[] | undefined) : messages.data?.pages.flatMap((p) => p.mails as Mail[])) ?? [],
    [allMode, unified.data, messages.data],
  )
  const total: number = allMode ? loaded.length : messages.data?.pages[0]?.total ?? 0
  return { messages, list: allMode ? unified : messages, loaded, total }
}

function SearchActions({ q, onSaveAll, onCreateRule }: Readonly<{ q: string; onSaveAll: () => void; onCreateRule: () => void }>) {
  const { t } = useTranslation()
  return (
    <>
      <Button variant="outline" className="h-11 md:h-9" onClick={onSaveAll}>
        <HardDriveDownload aria-hidden="true" />{t('mails.saveAllNas')}
      </Button>
      {q && (
        <Button variant="outline" className="h-11 md:h-9" onClick={onCreateRule}>
          <Zap aria-hidden="true" />{t('mails.createRule')}
        </Button>
      )}
    </>
  )
}

function ListFooter({ messages, empty }: Readonly<{ messages: ReturnType<typeof useGmailMessages>; empty: boolean }>) {
  const { t } = useTranslation()
  if (messages.hasNextPage) {
    return (
      <Button variant="outline" className="h-11 self-center md:h-9" disabled={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
        {t('mails.loadMore')}
      </Button>
    )
  }
  return empty ? null : <p className="text-center text-sm text-muted-foreground">{t('mails.allLoaded')}</p>
}

/** « Tous les comptes » lives in the URL (?account=all, §3.3); picking one account leaves it. */
function useAccountParam() {
  const { gmailAccounts, setActiveAccount } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const switchAccount = (value: string) => {
    if (value !== 'all') setActiveAccount(value)
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      if (value === 'all') out.set('account', 'all')
      else out.delete('account')
      return out
    })
  }
  return { allMode: params.get('account') === 'all', activeAccounts: gmailAccounts.filter((a) => a.is_active), switchAccount }
}

function buildBulkActions(t: TFunction, { onSelection, onLabel, ruleAccounts, onRule }: {
  onSelection: (action: MailAction) => void
  onLabel?: () => void
  ruleAccounts: Set<string | null>
  onRule: (accountId?: string) => void
}): BulkAction[] {
  return [
    { label: t('mails.action.archive'), icon: <Archive aria-hidden="true" />, onSelect: () => onSelection('archive') },
    { label: t('mails.action.archive_nas'), icon: <HardDriveDownload aria-hidden="true" />, onSelect: () => onSelection('archive_nas') },
    { label: t('mails.action.mark_read'), icon: <MailCheck aria-hidden="true" />, onSelect: () => onSelection('mark_read') },
    { label: t('mails.action.trash'), icon: <Trash2 aria-hidden="true" />, onSelect: () => onSelection('trash'), destructive: true },
    { label: t('mails.action.mark_unread'), icon: <MailOpen aria-hidden="true" />, onSelect: () => onSelection('mark_unread') },
    ...(onLabel ? [{ label: t('mails.action.label'), icon: <Tag aria-hidden="true" />, onSelect: onLabel }] : []),
    ...(ruleAccounts.size <= 1
      ? [{ label: t('mails.createRule'), icon: <Zap aria-hidden="true" />, onSelect: () => onRule([...ruleAccounts][0] ?? undefined) }]
      : []),
  ]
}

function groupByAccount(ids: string[], accountOf: (id: string) => string | null) {
  const byAccount = new Map<string, string[]>()
  for (const id of ids) {
    const account = accountOf(id)
    if (account) byAccount.set(account, [...(byAccount.get(account) ?? []), id])
  }
  return byAccount
}

/** Gmail account of the list, « Tous les comptes » included (P2); shown from two active accounts. */
function AccountSelect({ accounts, allMode, accountId, onChange }: Readonly<{
  accounts: { id: string; email: string }[]; allMode: boolean; accountId: string | null; onChange: (value: string) => void
}>) {
  const { t } = useTranslation()
  const value = allMode ? 'all' : accountId ?? ''
  return (
    <div className="md:w-72">
      <FormField id="mails-account" label={t('layout.gmailAccount')}>
        <select
          id="mails-account"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm"
        >
          <option value="all">{t('mails.allAccounts')}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
        </select>
      </FormField>
    </div>
  )
}

/** /mails (§7.2): Gmail search, chips, responsive list, bulk actions with undo, reader. */
export default function MailsPage() {
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const { allMode, activeAccounts, switchAccount } = useAccountParam()
  const { data: labels = [] } = useLabels(accountId)
  const { data: savedSearches = [] } = useSavedSearches()
  const createSaved = useCreateSavedSearch()
  const { messages, list, loaded, total } = useMailList(allMode, accountId, q)
  const { pending, run, done } = useMailActions(accountId, (id) => ['gmail', id, 'messages'])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [allResults, setAllResults] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [pickingLabel, setPickingLabel] = useState(false)
  // accountId: the rule's account when it is not the current one (« Tous les comptes »)
  const [ruleTarget, setRuleTarget] = useState<(RuleSheetTarget & { accountId?: string }) | null>(null)
  const [shortcutsOn, setShortcutsOn] = useShortcutsPref()
  const pageRef = useRef<HTMLDivElement>(null)

  // Selection and reader belong to one list: reset when the account or the search changes (§6.4)
  const scope = `${allMode ? 'all' : accountId}\n${q}`
  const [prevScope, setPrevScope] = useState(scope)
  if (scope !== prevScope) {
    setPrevScope(scope)
    setRowSelection({})
    setAllResults(false)
    setViewing(null)
  }

  const hidden = useMemo(() => new Set(pending.flatMap((p) => p.hidden)), [pending])
  const mails = useMemo(() => loaded.filter((m) => !hidden.has(m.id)), [loaded, hidden])
  const accountOf = (id: string) => loaded.find((m) => m.id === id)?.accountId ?? accountId
  // Only labels still in Gmail can be applied
  const userLabels = (labels as ApiLabel[]).filter((l) => l.type === 'user' && !l.deleted_at)

  const act = (action: MailAction, target: Target, hiddenIds: string[], labelId?: string) => {
    if (!allMode || !('ids' in target)) {
      void run(action, target, { count: 'ids' in target ? target.ids.length : total, hidden: hiddenIds, labelId })
      return
    }
    // « Tous les comptes »: one job per account (the API is per account)
    for (const [account, ids] of groupByAccount(target.ids, accountOf)) {
      void run(action, { ids }, { count: ids.length, hidden: ids, labelId, accountId: account })
    }
  }

  // Columns stay stable across renders; the row menu reaches the current handlers through this ref
  const onRowRef = useRef<(action: RowAction, mail: Mail) => void>(() => {})
  onRowRef.current = (action, mail) => (action === 'open' ? setViewing(mail.id) : act(action, { ids: [mail.id] }, [mail.id]))
  const columns = useMemo(() => buildColumns(t, labels, (a, m) => onRowRef.current(a, m), accountId, allMode), [t, labels, accountId, allMode])

  const table = useTable({
    features: dataListFeatures,
    columns,
    data: mails,
    getRowId: (m) => m.id,
    enableRowSelection: true,
    enableSorting: false, // Gmail lists by date only
    state: { rowSelection },
    onRowSelectionChange: (updater: Updater<RowSelectionState>) => {
      setAllResults(false)
      setRowSelection(updater)
    },
  })

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const count = selectedIds.length
  // I2: a non-empty search whose loaded rows are all selected can extend to every result (B5 needs a query)
  const canSelectAll = !allMode && !!q && count > 0 && count === mails.length && total > count
  const clearSelection = () => {
    setRowSelection({})
    setAllResults(false)
  }
  // The selection's sender when it has only one, else the search's
  const selectionSender = () => {
    const senders = new Set(mails.filter((m) => rowSelection[m.id]).map((m) => formatEmail(m.from)))
    return !allResults && senders.size === 1 ? [...senders][0] : searchSender(q)
  }
  const onSelection = (action: MailAction, labelId?: string) => {
    if (allResults) act(action, { query: q }, mails.map((m) => m.id), labelId)
    else act(action, { ids: selectedIds }, selectedIds, labelId)
    clearSelection()
  }

  const bulkActions = buildBulkActions(t, {
    onSelection,
    onLabel: !allMode && userLabels.length ? () => setPickingLabel(true) : undefined,
    // A rule belongs to one account: in « Tous les comptes », only for a one-account selection
    ruleAccounts: new Set(allMode ? selectedIds.map(accountOf) : []),
    onRule: (accountId) => setRuleTarget({ from: selectionSender(), accountId }),
  })

  const search = (next: string) => {
    if (next === q) {
      void list.refetch()
      return
    }
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      if (next) out.set('q', next)
      else out.delete('q')
      return out
    })
  }
  const chips: SavedSearch[] = [
    ...QUICK.map(([key, query]) => ({ id: `quick-${key}`, name: t(`mails.quick.${key}`), query })),
    ...(savedSearches as SavedSearch[]).map(({ id, name, query }) => ({ id, name, query })),
  ]
  const saveSearch = () =>
    createSaved.mutate({ name: q.slice(0, 60), query: q }, {
      onSuccess: () => toast.success(t('mails.searchSaved')),
      onError: () => toast.error(t('mails.saveFailed')),
    })

  // Shortcuts act on the selection, else on the row whose open button has focus (j/k move that focus)
  const rowButtons = () => Array.from(pageRef.current?.querySelectorAll<HTMLElement>('[data-row-open]') ?? [])
  const focusedMail = () => mails[rowButtons().indexOf(document.activeElement as HTMLElement)]
  const moveFocus = (step: number) => {
    const buttons = rowButtons()
    const i = buttons.indexOf(document.activeElement as HTMLElement)
    buttons[Math.min(Math.max(i + step, 0), buttons.length - 1)]?.focus()
  }
  const shortcutAction = (action: MailAction) => () => {
    if (count) return onSelection(action)
    const mail = focusedMail()
    if (mail) act(action, { ids: [mail.id] }, [mail.id])
  }
  useKeyboardShortcuts({
    j: () => moveFocus(1),
    k: () => moveFocus(-1),
    o: () => setViewing(focusedMail()?.id ?? null),
    e: shortcutAction('archive'),
    '#': shortcutAction('trash'),
    r: shortcutAction('mark_read'),
    u: shortcutAction('mark_unread'),
    '/': () => pageRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    Escape: clearSelection,
  }, shortcutsOn && !viewing && !pickingLabel && !ruleTarget)
  const toggleShortcuts = () => setShortcutsOn(!shortcutsOn)
  const viewingAccount = viewing ? accountOf(viewing) : accountId
  const ruleAccount = ruleTarget?.accountId ?? accountId

  return (
    <div ref={pageRef} className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader
        title={t('mails.title')}
        description={list.data ? t('mails.results', { count: total }) : undefined}
        actions={(
          <>
            <Button variant="outline" className="h-11 md:h-9" onClick={() => void list.refetch()} disabled={list.isFetching}>
              <RefreshCw aria-hidden="true" className={cn(list.isFetching && 'animate-spin motion-reduce:animate-none')} />{t('mails.refresh')}
            </Button>
            {/* Both act on one account's search */}
            {!allMode && (
              <SearchActions
                q={q}
                onSaveAll={() => void run('archive_nas', { query: q }, { count: total, hidden: [], label: t('mails.job.saveAll') })}
                onCreateRule={() => setRuleTarget({ from: searchSender(q) })}
              />
            )}
          </>
        )}
      />

      {activeAccounts.length >= 2 && (
        <AccountSelect accounts={activeAccounts} allMode={allMode} accountId={accountId} onChange={switchAccount} />
      )}

      <SearchBar value={q} onChange={search} saved={chips} onSave={saveSearch} />

      {pending.map((p) => p.jobId && (
        <JobProgressInline key={p.key} jobId={p.jobId} label={p.label} onDone={(job) => void done(p, job)} />
      ))}

      <BulkActionBar
        count={count}
        total={allResults || canSelectAll ? total : undefined}
        mode={allResults ? 'query' : 'ids'}
        actions={bulkActions}
        onSelectAll={canSelectAll ? () => setAllResults(true) : undefined}
        onClear={clearSelection}
      />

      {list.isError ? (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
          <span className="flex-1">{t('mails.loadError')}</span>
          <Button variant="outline" onClick={() => void list.refetch()}>{t('mails.retry')}</Button>
        </div>
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.subject || t('mails.noSubject')}
          onRowOpen={(row) => setViewing(row.id)}
          isLoading={list.isLoading}
          empty={(
            <EmptyState
              icon={<Inbox />}
              title={t('mails.empty')}
              description={t('mails.emptyDescription')}
              action={q ? <Button variant="outline" onClick={() => search('')}>{t('mails.clearSearch')}</Button> : undefined}
            />
          )}
        />
      )}

      {/* « Tous les comptes » has no pages: 50 mails per account */}
      {!allMode && <ListFooter messages={messages} empty={!mails.length} />}

      <ShortcutsHint on={shortcutsOn} onToggle={toggleShortcuts} />

      {viewingAccount && (
        <MailViewer
          accountId={viewingAccount}
          messageId={viewing}
          labels={viewingAccount === accountId ? labels : []}
          onClose={() => setViewing(null)}
          onAction={(action) => {
            setViewing(null)
            if (viewing) act(action, { ids: [viewing] }, [viewing])
          }}
          onCreateRule={(from) => {
            setViewing(null)
            setRuleTarget({ from, accountId: viewingAccount ?? undefined })
          }}
        />
      )}
      {ruleAccount && <RuleSheet accountId={ruleAccount} target={ruleTarget} onClose={() => setRuleTarget(null)} />}
      <LabelPicker
        open={pickingLabel}
        onOpenChange={setPickingLabel}
        labels={userLabels}
        onPick={(labelId) => {
          setPickingLabel(false)
          onSelection('label', labelId)
        }}
      />
    </div>
  )
}
