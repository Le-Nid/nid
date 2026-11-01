import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download, HardDriveDownload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/PageHeader'
import { PageTabs } from '@/components/app/PageTabs'
import { EmptyState } from '@/components/app/EmptyState'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { useAccount } from '@/hooks/useAccount'
import { useArchiveMails, useArchiveNow, useDashboardArchiveStats } from '@/hooks/queries'
import { formatBytes, formatRelative } from '@/utils/format'
import { SearchTab } from './archives/SearchTab'
import { ContactsTab } from './archives/ContactsTab'
import { TrashTab } from './archives/TrashTab'
import { RetentionTab } from './archives/RetentionTab'
import { SharesTab } from './archives/SharesTab'
import { useArchiveFilters, useMboxExport, type ArchivedMail } from './archives/shared'

const TABS = ['mails', 'contacts', 'trash', 'retention', 'shares']

/** « Dernière sauvegarde il y a 2 h · 47 108 mails · 5,9 Go » from archive-stats. */
function StatusBanner({ accountId }: Readonly<{ accountId: string }>) {
  const { t, i18n } = useTranslation()
  const stats = useDashboardArchiveStats(accountId).data
  if (!stats) return null
  // shortcut: no coverage % nor « mails non sauvegardés » (§7.5), archive-stats has no such data; add them with it
  const parts = [
    stats.last_archived_at ? t('archives.status.last', { when: formatRelative(stats.last_archived_at, i18n.language) }) : t('archives.status.never'),
    t('archives.status.count', { count: Number(stats.total_mails ?? 0) }),
    formatBytes(Number(stats.total_size ?? 0)),
  ]
  return <p className="rounded-lg bg-muted px-4 py-3 text-sm">{parts.join(' · ')}</p>
}

/** Header actions: export the current results (or the selection, from the bulk bar), back up to the NAS now. */
function HeaderActions({ accountId, onJob }: Readonly<{ accountId: string; onJob: (jobId: string) => void }>) {
  const { t } = useTranslation()
  const { apiParams, filtered } = useArchiveFilters()
  const search = useArchiveMails(accountId, apiParams)
  const exporter = useMboxExport(accountId)
  const archiveNow = useArchiveNow(accountId)
  // shortcut: a filtered export covers the loaded pages only (the API exports ids or everything); add a query export if needed
  const loaded = search.data?.pages.flatMap((p) => (p.mails as ArchivedMail[]).map((m) => m.id)) ?? []
  return (
    <>
      <Button variant="outline" className="h-11 md:h-9" disabled={exporter.isPending || (filtered && !loaded.length)} onClick={() => exporter.run(filtered ? loaded : undefined)}>
        <Download aria-hidden="true" />{t('archives.exportResults')}
      </Button>
      <Button
        className="h-11 md:h-9"
        disabled={archiveNow.isPending}
        onClick={() => archiveNow.mutate(undefined, {
          onSuccess: ({ jobId }) => onJob(jobId),
          onError: () => toast.error(t('archives.backupFailed')),
        })}
      >
        <HardDriveDownload aria-hidden="true" />{t('archives.backupNow')}
      </Button>
    </>
  )
}

/** /archives (§7.5): backup status, search with label tree and reader, then Corbeille, Rétention, Partages. Tab in the URL (§3.3). */
export default function ArchivesPage() {
  const { t } = useTranslation()
  const { accountId, account } = useAccount()
  // Shared by another user, read-only: searching and reading its archive only
  const readOnly = !!account?.shared_by
  const [params, setParams] = useSearchParams()
  const tab = TABS.slice(0, readOnly ? 2 : TABS.length).find((k) => k === params.get('tab')) ?? 'mails'
  const [job, setJob] = useState<string | null>(null)
  const stats = useDashboardArchiveStats(accountId)

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader title={t('archives.title')} actions={accountId && !readOnly && <HeaderActions accountId={accountId} onJob={setJob} />} />
      {accountId ? (
        <>
          <StatusBanner accountId={accountId} />
          {job && (
            <JobProgressInline
              jobId={job}
              label={t('archives.backupJob')}
              onDone={() => {
                setJob(null)
                void stats.refetch()
              }}
            />
          )}
          {/* Each tab keeps its own filters: switching drops the other tab's params */}
          <PageTabs
            value={tab}
            onChange={(next) => setParams(next === 'mails' ? {} : { tab: next })}
            label={t('archives.tabsLabel')}
            tabs={[
              { key: 'mails', label: t('archives.tab.mails'), content: <SearchTab accountId={accountId} /> },
              { key: 'contacts', label: t('archives.tab.contacts'), content: <ContactsTab accountId={accountId} /> },
              // Trash, retention and links belong to the owner
              ...(readOnly ? [] : [
                { key: 'trash', label: t('archives.tab.trash'), content: <TrashTab accountId={accountId} /> },
                { key: 'retention', label: t('archives.tab.retention'), content: <RetentionTab accountId={accountId} /> },
                { key: 'shares', label: t('archives.tab.shares'), content: <SharesTab /> },
              ]),
            ]}
          />
        </>
      ) : (
        <EmptyState title={t('archives.noAccount')} />
      )}
    </div>
  )
}
