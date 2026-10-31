import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { EmptyState } from '@/components/app/EmptyState'
import { LoadError } from '@/components/app/LoadError'
import { useArchiveContacts } from '@/hooks/queries'
import { DateCell, useDebounced } from './shared'

/** A row of `GET /api/archive/:id/contacts`. */
type Contact = { email: string; name: string | null; from_count: number; to_count: number; last_at: string | null }

const col = createColumnHelper<typeof dataListFeatures, Contact>()
function Count({ value }: Readonly<{ value: number }>) {
  const { i18n } = useTranslation()
  return <span className="tabular-nums">{value.toLocaleString(i18n.language)}</span>
}

function buildColumns(t: TFunction) {
  return col.columns([
    col.accessor((c) => c.name ?? c.email, {
      id: 'contact',
      header: t('archives.contacts.col.contact'),
      meta: { mobile: 'title' },
      cell: ({ getValue }) => <span className="block max-w-80 truncate font-medium">{getValue()}</span>,
    }),
    col.accessor('email', {
      header: t('archives.contacts.col.email'),
      meta: { mobile: 'subtitle' },
      cell: ({ getValue }) => <span className="block max-w-80 truncate">{getValue()}</span>,
    }),
    col.accessor('from_count', {
      header: t('archives.contacts.col.from'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <Count value={getValue()} />,
    }),
    col.accessor('to_count', {
      header: t('archives.contacts.col.to'),
      meta: { mobile: 'meta', align: 'end' },
      cell: ({ getValue }) => <Count value={getValue()} />,
    }),
    col.accessor('last_at', { header: t('archives.contacts.col.last'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
  ])
}

/** « Contacts » (B19): who the archive talks with, from the From / To headers; a contact opens the mails it sent. */
export function ContactsTab({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useDebounced(q, (next) => setParams(next ? { tab: 'contacts', q: next } : { tab: 'contacts' }, { replace: true }))
  const query = useArchiveContacts(accountId, q)
  const contacts: Contact[] = useMemo(() => query.data?.pages.flatMap((p) => p.contacts as Contact[]) ?? [], [query.data])
  const columns = useMemo(() => buildColumns(t), [t])
  const table = useTable({ features: dataListFeatures, columns, data: contacts, getRowId: (c) => c.email, enableSorting: false })
  const total = query.data?.pages[0]?.total

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={t('archives.contacts.search')}
          placeholder={t('archives.contacts.searchPlaceholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-11 pl-9 text-base md:h-9 md:text-sm"
        />
      </div>
      {total !== undefined && <p aria-live="polite" className="text-sm text-muted-foreground">{t('archives.contacts.count', { count: total })}</p>}
      {query.isError ? (
        <LoadError message={t('archives.contacts.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => t('archives.contacts.open', { contact: row.original.name ?? row.original.email })}
          onRowOpen={(row) => setParams({ sender: row.original.email })}
          isLoading={query.isLoading}
          empty={<EmptyState icon={<Users />} title={t(q ? 'archives.contacts.noMatch' : 'archives.contacts.empty')} />}
        />
      )}
      {query.hasNextPage && (
        <Button variant="outline" className="h-11 self-center md:h-9" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t('mails.loadMore')}
        </Button>
      )}
    </div>
  )
}
