import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useTable, type RowSelectionState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { BulkActionBar } from '@/components/app/BulkActionBar'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { LoadError } from '@/components/app/LoadError'
import {
  useArchiveTrash, useArchiveTrashConfig, useEmptyArchiveTrash, useRestoreArchived, useUpdateTrashConfig,
} from '@/hooks/queries'
import { useAuthStore } from '@/store/auth.store'
import { actionsHeader, col, DateCell, mailColumns, type ArchivedMail } from './shared'

// shortcut: the 100 most recently deleted mails, no paging; add « Afficher plus » when trashes grow past that
const TRASH_PARAMS = { page: 1, limit: 100 }

type TrashConfig = { retentionDays: number; purgeEnabled: boolean }

function buildColumns(t: TFunction, restore: (ids: string[]) => void) {
  const base = mailColumns(t)
  return col.columns([
    base.subject,
    base.sender,
    col.accessor('deleted_at', { header: t('archives.trash.deletedAt'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
    base.size,
    col.display({
      id: 'actions',
      header: actionsHeader(t),
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-11 md:size-8"
          aria-label={t('archives.trash.restoreOne', { subject: row.original.subject || t('mails.noSubject') })}
          onClick={() => restore([row.original.id])}
        >
          <ArchiveRestore aria-hidden="true" />
        </Button>
      ),
    }),
  ])
}

/** Instance-wide purge settings: admins edit them, the API refuses anyone else (§7.5). */
function TrashSettings({ config }: Readonly<{ config: TrashConfig }>) {
  const { t } = useTranslation()
  const id = useId()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const update = useUpdateTrashConfig()
  const [days, setDays] = useState(String(config.retentionDays))
  const [purge, setPurge] = useState(config.purgeEnabled)
  const summary = config.purgeEnabled ? t('archives.trash.purgeAfter', { count: config.retentionDays }) : t('archives.trash.purgeOff')
  if (!isAdmin) return <p className="text-sm text-muted-foreground">{summary}</p>

  const submit = (e: FormEvent) => {
    e.preventDefault()
    update.mutate({ retentionDays: Number(days), purgeEnabled: purge }, {
      onSuccess: () => toast.success(t('archives.trash.configSaved')),
      onError: () => toast.error(t('archives.trash.configFailed')),
    })
  }
  return (
    <form onSubmit={submit} aria-label={t('archives.trash.settings')} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-end">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-days`} className="text-sm font-medium">{t('archives.trash.retentionDays')}</label>
        <Input id={`${id}-days`} type="number" inputMode="numeric" min={1} max={365} required value={days} onChange={(e) => setDays(e.target.value)} className="h-11 w-32 text-base md:h-9 md:text-sm" />
      </div>
      <div className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
        <Checkbox id={`${id}-purge`} checked={purge} onCheckedChange={(v) => setPurge(!!v)} />
        <label htmlFor={`${id}-purge`}>{t('archives.trash.purgeEnabled')}</label>
      </div>
      <Button type="submit" variant="outline" className="h-11 md:h-9" disabled={update.isPending}>{t('common.save')}</Button>
    </form>
  )
}

/** « Corbeille » (§7.5): deleted archives, restore, empty for good (D2), purge settings. */
export function TrashTab({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation()
  const trash = useArchiveTrash(accountId, TRASH_PARAMS)
  const config: TrashConfig | undefined = useArchiveTrashConfig().data
  const restoreMutation = useRestoreArchived(accountId)
  const empty = useEmptyArchiveTrash(accountId)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const restore = (ids: string[]) => restoreMutation.mutate(ids, {
    onSuccess: ({ restored }: { restored: number }) => {
      setRowSelection({})
      toast.success(t('archives.trash.restored', { count: restored }))
    },
    onError: () => toast.error(t('archives.trash.restoreFailed')),
  })
  // Columns stay stable; the row button reaches the current handler through this ref
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const columns = useMemo(() => buildColumns(t, (ids) => restoreRef.current(ids)), [t])
  const mails: ArchivedMail[] = trash.data?.mails ?? []
  const total: number = trash.data?.total ?? 0
  const table = useTable({
    features: dataListFeatures,
    columns,
    data: mails,
    getRowId: (m) => m.id,
    enableRowSelection: true,
    enableSorting: false,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
  })
  const selected = Object.keys(rowSelection).filter((id) => rowSelection[id])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('archives.trash.count', { count: total })}</p>
        {total > 0 && (
          <ConfirmDialog
            trigger={<Button variant="outline" className="h-11 text-destructive md:h-9"><Trash2 aria-hidden="true" />{t('archives.trash.empty')}</Button>}
            title={t('archives.trash.emptyTitle', { count: total })}
            description={t('archives.trash.emptyDescription')}
            confirmLabel={t('archives.trash.emptyConfirm', { count: total })}
            destructive
            onConfirm={() => empty.mutate(undefined, {
              onSuccess: ({ deleted }: { deleted: number }) => toast.success(t('archives.trash.emptied', { count: deleted })),
              onError: () => toast.error(t('archives.trash.emptyFailed')),
            })}
          />
        )}
      </div>
      {config && <TrashSettings key={JSON.stringify(config)} config={config} />}

      <BulkActionBar
        count={selected.length}
        mode="ids"
        actions={[{ label: t('archives.trash.restore'), icon: <ArchiveRestore aria-hidden="true" />, onSelect: () => restore(selected) }]}
        onClear={() => setRowSelection({})}
      />
      {trash.isError ? (
        <LoadError message={t('archives.trash.loadError')} onRetry={() => void trash.refetch()} />
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.subject || t('mails.noSubject')}
          isLoading={trash.isLoading}
          empty={<EmptyState icon={<Trash2 />} title={t('archives.trash.emptyState')} />}
        />
      )}
    </div>
  )
}
