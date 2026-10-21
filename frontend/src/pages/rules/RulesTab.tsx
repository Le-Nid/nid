import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { Switch } from 'radix-ui'
import { toast } from 'sonner'
import { Ellipsis, Plus, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { describeAction, describeConditions, useRunRuleWithUndo, type RuleSheetTarget } from '@/components/app/RuleSheet'
import { useDeleteRule, useLabels, useRules, useToggleRule } from '@/hooks/queries'
import { formatRelative } from '@/utils/format'
import type { ApiLabel } from '@/utils/gmail'
import type { Rule } from '@/types/rules'

type Handlers = { run: (r: Rule) => void; edit: (r: Rule) => void; remove: (r: Rule) => void; toggle: (r: Rule) => void }

function RowMenu({ rule, on }: Readonly<{ rule: Rule; on: Handlers }>) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={t('rules.rowActions', { name: rule.name })}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => on.run(rule)}>{t('rules.menu.run')}</DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => on.edit(rule)}>{t('rules.menu.edit')}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="min-h-11 md:min-h-8" onSelect={() => on.remove(rule)}>{t('rules.menu.delete')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ActiveSwitch({ rule, onToggle }: Readonly<{ rule: Rule; onToggle: (r: Rule) => void }>) {
  const { t } = useTranslation()
  return (
    <Switch.Root
      checked={rule.is_active}
      onCheckedChange={() => onToggle(rule)}
      aria-label={t('rules.toggle', { name: rule.name })}
      // Hit area grown to 44 px (A1) around a 20 px track; z-10 keeps it above the card's stretched button
      className="relative z-10 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input transition-colors before:absolute before:-inset-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=checked]:bg-primary motion-reduce:transition-none"
    >
      <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-[18px] motion-reduce:transition-none" />
    </Switch.Root>
  )
}

const col = createColumnHelper<typeof dataListFeatures, Rule>()

function buildColumns(t: TFunction, locale: string, cells: { current: { on: Handlers; labels: ApiLabel[] } }) {
  // shortcut: no « mails traités » column (§7.4), the API keeps no per-rule count; add it with that data
  return col.columns([
    col.accessor('name', { header: t('rules.col.name'), meta: { mobile: 'title' }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
    col.accessor('conditions', {
      header: t('rules.col.conditions'),
      meta: { mobile: 'subtitle' },
      cell: ({ getValue }) => <span className="block max-w-80 text-muted-foreground">{describeConditions(getValue(), t)}</span>,
    }),
    // First meta = the card's top-right corner (DataList)
    col.accessor('is_active', {
      header: t('rules.col.active'),
      meta: { mobile: 'meta' },
      cell: ({ row }) => <ActiveSwitch rule={row.original} onToggle={cells.current.on.toggle} />,
    }),
    col.accessor('action', {
      header: t('rules.col.action'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => describeAction(getValue(), t, cells.current.labels),
    }),
    col.accessor('last_run_at', {
      header: t('rules.col.lastRun'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => {
        const value = getValue()
        return <span className="whitespace-nowrap">{value ? formatRelative(value, locale) : t('rules.never')}</span>
      },
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">{t('common.actions')}</span>,
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => <RowMenu rule={row.original} on={cells.current.on} />,
    }),
  ])
}

/** « Règles » tab (§7.4, artboard 12). */
export function RulesTab({ accountId, onEdit }: Readonly<{ accountId: string; onEdit: (target: RuleSheetTarget) => void }>) {
  const { t, i18n } = useTranslation()
  const rules = useRules(accountId)
  const labels: ApiLabel[] = useLabels(accountId).data ?? []
  const toggle = useToggleRule(accountId)
  const del = useDeleteRule(accountId)
  const runWithUndo = useRunRuleWithUndo(accountId)
  const [deleting, setDeleting] = useState<Rule | null>(null)

  const on: Handlers = {
    run: (r) => void runWithUndo(r),
    edit: (rule) => onEdit({ rule }),
    remove: setDeleting,
    toggle: (r) => toggle.mutate(r.id, { onError: () => toast.error(t('rules.toggleFailed')) }),
  }
  // Columns stay stable; cells read the current handlers and labels through this ref
  const cells = useRef({ on, labels })
  cells.current = { on, labels }
  const columns = useMemo(() => buildColumns(t, i18n.language, cells), [t, i18n.language])
  const data: Rule[] = rules.data ?? []
  const table = useTable({ features: dataListFeatures, columns, data, getRowId: (r) => r.id, enableSorting: false })

  if (rules.isError) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
        <span className="flex-1">{t('rules.loadError')}</span>
        <Button variant="outline" onClick={() => void rules.refetch()}>{t('mails.retry')}</Button>
      </div>
    )
  }

  return (
    <>
      <DataList
        table={table}
        rowLabel={(row) => row.original.name}
        onRowOpen={(row) => onEdit({ rule: row.original })}
        isLoading={rules.isLoading}
        empty={(
          <EmptyState
            icon={<Zap />}
            title={t('rules.empty.title')}
            description={t('rules.empty.description')}
            action={<Button onClick={() => onEdit({})}><Plus aria-hidden="true" />{t('rules.newRule')}</Button>}
          />
        )}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('rules.confirmDelete.title', { name: deleting?.name })}
        description={t('rules.confirmDelete.description')}
        confirmLabel={t('rules.confirmDelete.action')}
        destructive
        onConfirm={() => deleting && del.mutate(deleting.id, {
          onSuccess: () => toast.success(t('rules.deleted')),
          onError: () => toast.error(t('rules.deleteFailed')),
        })}
      />
    </>
  )
}
