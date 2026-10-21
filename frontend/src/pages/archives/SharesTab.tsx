import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { Share2 } from 'lucide-react'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { EmptyState } from '@/components/app/EmptyState'
import { LoadError } from '@/components/app/LoadError'
import { formatSender } from '@/utils/format'
import { ShareActions, useActiveShares, type Share } from './ShareDialog'
import { actionsHeader, DateCell } from './shared'

const col = createColumnHelper<typeof dataListFeatures, Share>()

function buildColumns(t: TFunction) {
  return col.columns([
    col.accessor('subject', {
      header: t('archives.col.subject'),
      meta: { mobile: 'title' },
      cell: ({ getValue }) => <span className="block max-w-80 truncate">{getValue() || t('mails.noSubject')}</span>,
    }),
    col.accessor('sender', { header: t('archives.col.sender'), meta: { mobile: 'subtitle' }, cell: ({ getValue }) => formatSender(getValue() ?? '') }),
    col.accessor('expires_at', {
      header: t('archives.shares.expires'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => <DateCell value={getValue()} />,
    }),
    col.accessor('access_count', {
      header: t('archives.shares.accesses'),
      meta: { mobile: 'meta' },
      cell: ({ getValue, row }) => t('archives.shares.accessCount', { count: getValue(), max: row.original.max_access ?? '∞' }),
    }),
    col.display({
      id: 'actions',
      header: actionsHeader(t),
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => <ShareActions share={row.original} name={row.original.subject || t('mails.noSubject')} />,
    }),
  ])
}

/** « Partages » (replaces /sharing): every active link, copy or revoke. */
export function SharesTab() {
  const { t } = useTranslation()
  const { shares, isLoading, isError, refetch } = useActiveShares()
  const columns = useMemo(() => buildColumns(t), [t])
  const table = useTable({ features: dataListFeatures, columns, data: shares, getRowId: (s) => s.id, enableSorting: false })
  if (isError) return <LoadError message={t('archives.shares.loadError')} onRetry={() => void refetch()} />
  return (
    <DataList
      table={table}
      rowLabel={(row) => row.original.subject || t('mails.noSubject')}
      isLoading={isLoading}
      empty={<EmptyState icon={<Share2 />} title={t('archives.shares.empty')} description={t('archives.shares.emptyDescription')} />}
    />
  )
}
