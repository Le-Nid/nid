import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { ScrollText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { EmptyState } from '@/components/app/EmptyState'
import { FormField } from '@/components/app/FormField'
import { LoadError } from '@/components/app/LoadError'
import { useAdminAudit } from '@/hooks/queries'
import { DateCell } from '../archives/shared'
import { PAGE_SIZE, Pager, selectClass, useTabParams } from './shared'

/** A row of `GET /api/admin/audit` (B14). */
type AuditLog = {
  id: string
  user_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  created_at: string
}

const col = createColumnHelper<typeof dataListFeatures, AuditLog>()
const buildColumns = (t: TFunction) => col.columns([
  col.accessor('action', { header: t('admin.audit.col.action'), meta: { mobile: 'title' }, cell: ({ getValue }) => <code className="text-sm">{getValue()}</code> }),
  col.accessor('user_email', { header: t('admin.audit.col.user'), meta: { mobile: 'subtitle' }, cell: ({ getValue }) => getValue() ?? t('admin.audit.deletedUser') }),
  col.display({
    id: 'target',
    header: t('admin.audit.col.target'),
    meta: { mobile: 'meta' },
    cell: ({ row }) => [row.original.target_type, row.original.target_id].filter(Boolean).join(' · ') || '—',
  }),
  col.accessor('created_at', { header: t('admin.audit.col.date'), meta: { mobile: 'meta' }, cell: ({ getValue }) => <DateCell value={getValue()} /> }),
])

/** « Audit » (§7.8): the instance log, filtered by user email and action, paginated. */
export function AuditTab() {
  const { t } = useTranslation()
  const id = useId()
  const { values, page, set } = useTabParams(['user', 'action'] as const)
  const query = useAdminAudit({ page, limit: PAGE_SIZE, user: values.user || undefined, action: values.action || undefined })
  const columns = useMemo(() => buildColumns(t), [t])
  const logs: AuditLog[] = query.data?.logs ?? []
  const actions: string[] = query.data?.actions ?? []
  const table = useTable({ features: dataListFeatures, columns, data: logs, getRowId: (l) => l.id, enableSorting: false })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <FormField id={`${id}-user`} label={t('admin.audit.user')}>
          <Input id={`${id}-user`} type="search" placeholder={t('admin.audit.userPlaceholder')} value={values.user} onChange={(e) => set({ user: e.target.value })} className="h-11 text-base md:h-9 md:w-64 md:text-sm" />
        </FormField>
        <FormField id={`${id}-action`} label={t('admin.audit.action')}>
          <select id={`${id}-action`} value={values.action} onChange={(e) => set({ action: e.target.value })} className={selectClass}>
            <option value="">{t('admin.audit.allActions')}</option>
            {/* The filtered action stays listed even before the list loads */}
            {[...new Set([...actions, values.action].filter(Boolean))].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </FormField>
      </div>
      {query.isError ? (
        <LoadError message={t('admin.audit.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.action}
          isLoading={query.isLoading}
          empty={<EmptyState icon={<ScrollText />} title={t('admin.audit.empty')} />}
        />
      )}
      <Pager page={page} total={query.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
    </div>
  )
}
