import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Hourglass, Play, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { FormField } from '@/components/app/FormField'
import { labelName } from '@/components/app/LabelTree'
import { LoadError } from '@/components/app/LoadError'
import { RowMenu } from '@/components/app/RowMenu'
import {
  useCreateRetentionPolicy, useDeleteRetentionPolicy, useLabels, useRetentionPolicies, useRunRetention, useUpdateRetentionPolicy,
} from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatRelative } from '@/utils/format'
import type { ApiLabel } from '@/utils/gmail'
import { actionsHeader } from './shared'

/** A row of `GET /api/retention`; `label` is a Gmail label id (L6). */
type Policy = {
  id: string
  name: string
  account_id: string | null
  label: string | null
  max_age_days: number
  last_run_at: string | null
  deleted_count: number
}
type Handlers = { edit: (p: Policy) => void; remove: (p: Policy) => void }

const col = createColumnHelper<typeof dataListFeatures, Policy>()

function buildColumns(t: TFunction, locale: string, cells: { current: { on: Handlers; labels: ApiLabel[] } }) {
  return col.columns([
    col.accessor('name', { header: t('archives.retention.col.name'), meta: { mobile: 'title' }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
    col.accessor('label', {
      header: t('archives.retention.col.label'),
      meta: { mobile: 'subtitle' },
      cell: ({ getValue }) => {
        const label = cells.current.labels.find((l) => l.id === getValue())
        return label ? labelName(label, t) : t('archives.retention.allLabels')
      },
    }),
    col.accessor('max_age_days', {
      header: t('archives.retention.col.age'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => t('archives.retention.olderThan', { count: getValue() }),
    }),
    col.accessor('last_run_at', {
      header: t('archives.retention.col.lastRun'),
      meta: { mobile: 'meta' },
      cell: ({ getValue, row }) => {
        const value = getValue()
        return value ? t('archives.retention.ran', { when: formatRelative(value, locale), count: row.original.deleted_count }) : t('rules.never')
      },
    }),
    col.display({
      id: 'actions',
      header: actionsHeader(t),
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => (
        <RowMenu
          label={t('archives.retention.rowActions', { name: row.original.name })}
          items={[
            { key: 'edit', label: t('common.edit'), onSelect: () => cells.current.on.edit(row.original) },
            { key: 'delete', label: t('common.delete'), onSelect: () => cells.current.on.remove(row.original), destructive: true },
          ]}
        />
      ),
    }),
  ])
}

function PolicyForm({ accountId, policy, labels, onClose }: Readonly<{ accountId: string; policy: Policy | null; labels: ApiLabel[]; onClose: () => void }>) {
  const { t } = useTranslation()
  const id = useId()
  const create = useCreateRetentionPolicy()
  const update = useUpdateRetentionPolicy()
  const [name, setName] = useState(policy?.name ?? '')
  const [label, setLabel] = useState(policy?.label ?? '')
  const [days, setDays] = useState(String(policy?.max_age_days ?? 365))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const options = {
      onSuccess: () => {
        toast.success(t(policy ? 'archives.retention.saved' : 'archives.retention.created'))
        onClose()
      },
      onError: () => toast.error(t('archives.retention.failed')),
    }
    const maxAgeDays = Number(days)
    // '' clears the label on update; on create no label = every archived mail of the account
    if (policy) update.mutate({ id: policy.id, name: name.trim(), label, maxAgeDays }, options)
    else create.mutate({ name: name.trim(), gmailAccountId: accountId, label: label || undefined, maxAgeDays }, options)
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{t(policy ? 'archives.retention.editTitle' : 'archives.retention.createTitle')}</SheetTitle>
        <SheetDescription>{t('archives.retention.formDescription')}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
        <FormField id={`${id}-name`} label={t('archives.retention.col.name')}>
          <Input id={`${id}-name`} required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base md:h-9 md:text-sm" />
        </FormField>
        <FormField id={`${id}-label`} label={t('archives.retention.col.label')}>
          <select
            id={`${id}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-11 rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm"
          >
            <option value="">{t('archives.retention.allLabels')}</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{labelName(l, t)}</option>)}
          </select>
        </FormField>
        <FormField id={`${id}-days`} label={t('archives.retention.maxAgeDays')}>
          <Input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="h-11 w-32 text-base md:h-9 md:text-sm"
          />
        </FormField>
      </div>
      <SheetFooter className="pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button type="submit" className="h-11 md:h-9" disabled={create.isPending || update.isPending}>
          {t(policy ? 'common.save' : 'common.create')}
        </Button>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onClose}>{t('common.cancel')}</Button>
      </SheetFooter>
    </form>
  )
}

/** « Rétention » (§7.5): archive policies of this account (or of all accounts), run now, edit in a sheet, delete (confirm). */
export function RetentionTab({ accountId }: Readonly<{ accountId: string }>) {
  const { t, i18n } = useTranslation()
  const isMobile = useIsMobile()
  const query = useRetentionPolicies()
  const labels: ApiLabel[] = (useLabels(accountId).data ?? []).filter((l: ApiLabel) => !l.deleted_at)
  const run = useRunRetention()
  const remove = useDeleteRetentionPolicy()
  const [editing, setEditing] = useState<Policy | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Policy | null>(null)

  const policies = ((query.data ?? []) as Policy[]).filter((p) => !p.account_id || p.account_id === accountId)
  const on: Handlers = { edit: setEditing, remove: setDeleting }
  // Columns stay stable; cells read the current handlers and labels through this ref
  const cells = useRef({ on, labels })
  cells.current = { on, labels }
  const columns = useMemo(() => buildColumns(t, i18n.language, cells), [t, i18n.language])
  const table = useTable({ features: dataListFeatures, columns, data: policies, getRowId: (p) => p.id, enableSorting: false })

  const runNow = () => run.mutate(undefined, {
    onSuccess: ({ policiesRun, totalDeleted }: { policiesRun: number; totalDeleted: number }) =>
      toast.success(t('archives.retention.runDone', { count: totalDeleted, policies: policiesRun })),
    onError: () => toast.error(t('archives.retention.runFailed')),
  })
  const close = () => setEditing(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">{t('archives.retention.description')}</p>
        <Button variant="outline" className="h-11 md:h-9" disabled={run.isPending || !policies.length} onClick={runNow}>
          <Play aria-hidden="true" />{t('archives.retention.run')}
        </Button>
        <Button className="h-11 md:h-9" onClick={() => setEditing('new')}><Plus aria-hidden="true" />{t('archives.retention.new')}</Button>
      </div>
      {query.isError ? (
        <LoadError message={t('archives.retention.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.name}
          onRowOpen={(row) => setEditing(row.original)}
          isLoading={query.isLoading}
          empty={<EmptyState icon={<Hourglass />} title={t('archives.retention.empty')} description={t('archives.retention.emptyDescription')} />}
        />
      )}
      <Sheet open={!!editing} onOpenChange={(open) => !open && close()}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} showCloseButton={false} className="max-h-[90dvh] sm:max-w-md">
          {editing && (
            <PolicyForm
              key={editing === 'new' ? 'new' : editing.id}
              accountId={accountId}
              policy={editing === 'new' ? null : editing}
              labels={labels}
              onClose={close}
            />
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('archives.retention.confirmDelete', { name: deleting?.name })}
        description={t('archives.retention.confirmDeleteDescription')}
        confirmLabel={t('archives.retention.deleteAction')}
        destructive
        onConfirm={() => deleting && remove.mutate(deleting.id, {
          onSuccess: () => toast.success(t('archives.retention.deleted')),
          onError: () => toast.error(t('archives.retention.deleteFailed')),
        })}
      />
    </div>
  )
}
