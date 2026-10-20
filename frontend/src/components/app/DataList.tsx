import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react'
import {
  columnVisibilityFeature, metaHelper, rowSelectionFeature, rowSortingFeature, tableFeatures,
  type Cell, type Header, type ReactTable, type Row, type RowData,
} from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/** Where a column goes on a mobile card (M2, §6.1): leading = avatar, menu = row actions. */
export type NidColumnMeta = {
  mobile: 'title' | 'subtitle' | 'meta' | 'hidden' | 'leading' | 'menu'
  align?: 'start' | 'end'
}

/** Features every DataList table is built with: `useTable({ features: dataListFeatures, ... })`. */
export const dataListFeatures = tableFeatures({
  rowSelectionFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  columnMeta: metaHelper<NidColumnMeta>(),
})
type F = typeof dataListFeatures

interface DataListProps<TData extends RowData> {
  table: ReactTable<F, TData, any>
  /** Accessible name of a row: checkbox "Sélectionner {label}". */
  rowLabel: (row: Row<F, TData>) => string
  onRowOpen?: (row: Row<F, TData>) => void
  empty: ReactNode
  isLoading?: boolean
}

const SKELETON_ROWS = 5
const role = (cell: Cell<F, any, any>) => cell.column.columnDef.meta?.mobile ?? 'meta'
const isInteractive = (e: MouseEvent) => !!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], [role="menuitem"]')

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const
function ariaSort(header: Header<F, any, any>) {
  if (!header.column.getCanSort()) return undefined
  const sorted = header.column.getIsSorted()
  return sorted ? ARIA_SORT[sorted] : 'none'
}

function SortIcon({ sorted }: Readonly<{ sorted: false | 'asc' | 'desc' }>) {
  if (sorted === 'asc') return <ArrowUp className="size-3.5" aria-hidden="true" />
  if (sorted === 'desc') return <ArrowDown className="size-3.5" aria-hidden="true" />
  return <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
}

/**
 * One TanStack Table instance rendered as a <table> at ≥md and as cards below (M1, M2).
 * Selection checkboxes appear when the table is created with `enableRowSelection`.
 */
export function DataList<TData extends RowData>({ table, rowLabel, onRowOpen, empty, isLoading }: Readonly<DataListProps<TData>>) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const selectable = !!table.options.enableRowSelection
  const rows = table.getRowModel().rows
  const selected = table.getSelectedRowModel().rows.length

  const announce = (
    <p aria-live="polite" className="sr-only">{selected ? t('dataList.selected', { count: selected }) : ''}</p>
  )
  if (!isLoading && rows.length === 0) return <>{empty}{announce}</>

  const rowCheckbox = (row: Row<F, TData>, className?: string) => (
    <Checkbox
      className={className}
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect()}
      onCheckedChange={(v) => row.toggleSelected(!!v)}
      aria-label={t('dataList.selectRow', { label: rowLabel(row) })}
    />
  )

  if (isMobile) {
    return (
      <div aria-busy={isLoading || undefined}>
        {/* role="list": Safari drops list semantics on list-style: none */}
        <ul role="list" className="flex flex-col gap-2" aria-label={isLoading ? t('dataList.loading') : undefined}>
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <li key={i} className="flex flex-col gap-2 rounded-xl border p-3.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </li>
              ))
            : rows.map((row) => {
                const cells = row.getAllCells()
                const by = (r: NidColumnMeta['mobile']) => cells.filter((c) => role(c) === r)
                const [firstMeta, ...otherMeta] = by('meta')
                const title = by('title').map((c) => <table.FlexRender key={c.id} cell={c} />)
                return (
                  <li
                    key={row.id}
                    className={cn('relative flex min-h-[52px] items-start gap-3 rounded-xl border bg-card p-3.5', row.getIsSelected() && 'border-primary bg-primary-soft')}
                  >
                    {selectable && rowCheckbox(row, 'relative z-10 mt-0.5 size-5')}
                    {by('leading').map((c) => <div key={c.id} className="shrink-0"><table.FlexRender cell={c} /></div>)}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        {onRowOpen ? (
                          // Stretched button: the whole card opens the row; checkbox and menu sit above it (z-10)
                          <button type="button" onClick={() => onRowOpen(row)} className="min-w-0 truncate text-left font-medium after:absolute after:inset-0 after:rounded-xl">
                            {title}
                          </button>
                        ) : (
                          <span className="min-w-0 truncate font-medium">{title}</span>
                        )}
                        {firstMeta && <span className="shrink-0 text-xs text-muted-foreground"><table.FlexRender cell={firstMeta} /></span>}
                      </div>
                      {by('subtitle').map((c) => (
                        <div key={c.id} className="line-clamp-2 text-sm text-muted-foreground"><table.FlexRender cell={c} /></div>
                      ))}
                      {otherMeta.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {otherMeta.map((c) => <span key={c.id}><table.FlexRender cell={c} /></span>)}
                        </div>
                      )}
                    </div>
                    {by('menu').map((c) => <div key={c.id} className="relative z-10 shrink-0"><table.FlexRender cell={c} /></div>)}
                  </li>
                )
              })}
        </ul>
        {announce}
      </div>
    )
  }

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide())
  const allSelected = table.getIsAllPageRowsSelected()
  return (
    <div className="flex flex-col gap-2" aria-busy={isLoading || undefined}>
      {hideable.length > 0 && (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Columns3 aria-hidden="true" />{t('dataList.columns')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hideable.map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                  {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="h-10">
              {selectable && (
                <TableHead scope="col" className="w-10">
                  <Checkbox
                    checked={allSelected || (table.getIsSomePageRowsSelected() && 'indeterminate')}
                    onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
                    aria-label={t('dataList.selectAll')}
                  />
                </TableHead>
              )}
              {group.headers.map((header) => {
                const end = header.column.columnDef.meta?.align === 'end'
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={cn(end && 'text-right')}
                    aria-sort={ariaSort(header)}
                  >
                    {!header.isPlaceholder && (header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()} className={cn('inline-flex items-center gap-1 hover:text-foreground', end && 'flex-row-reverse')}>
                        <table.FlexRender header={header} />
                        <SortIcon sorted={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    ))}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <TableRow key={i} className="h-[52px]">
                  {selectable && <TableCell />}
                  {table.getVisibleLeafColumns().map((c) => <TableCell key={c.id}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn('h-[52px]', onRowOpen && 'cursor-pointer')}
                  // Mouse convenience only; keyboard users get the title button
                  onClick={onRowOpen ? (e) => { if (!isInteractive(e)) onRowOpen(row) } : undefined}
                >
                  {selectable && <TableCell>{rowCheckbox(row)}</TableCell>}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.align === 'end' && 'text-right')}>
                      {onRowOpen && role(cell) === 'title' ? (
                        <button type="button" onClick={() => onRowOpen(row)} className="text-left font-medium hover:underline">
                          <table.FlexRender cell={cell} />
                        </button>
                      ) : (
                        <table.FlexRender cell={cell} />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {announce}
    </div>
  )
}
