import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState } from '@/components/app/EmptyState'
import { PageTabs } from '@/components/app/PageTabs'
import { useAccount } from '@/hooks/useAccount'
import { useNewsletters } from '@/hooks/queries'
import { formatBytes } from '@/utils/format'
import { SendersTab, type NewsletterSender } from './cleanup/SendersTab'
import { LargeTab } from './cleanup/LargeTab'

const TOP = 8 // §7.3 « Les 8 premiers expéditeurs pèsent… »

/** « 6,1 Go récupérables. Les 8 premiers expéditeurs pèsent 4,6 Go. » from the cached scan. */
function useSummary(accountId: string | null) {
  const { t } = useTranslation()
  const senders: NewsletterSender[] = useNewsletters(accountId).data?.senders ?? []
  if (!senders.length) return undefined
  const sizes = senders.map((s) => s.totalSizeBytes).sort((a, b) => b - a)
  const sum = (list: number[]) => list.reduce((n, s) => n + s, 0)
  const top = sizes.slice(0, TOP)
  return t('cleanup.summary', { total: formatBytes(sum(sizes)), count: top.length, top: formatBytes(sum(top)) })
}

/** /cleanup (§7.3, artboards 5–6): senders & newsletters, large mails & attachments. Tab in the URL (§3.3). */
export default function CleanupPage() {
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'large' ? 'large' : 'senders'
  const summary = useSummary(accountId)

  // Each tab keeps its own filters: switching drops the other tab's params
  const setTab = (next: string) => setParams(next === 'senders' ? {} : { tab: next })

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader title={t('cleanup.title')} description={summary} />
      {accountId ? (
        <PageTabs
          value={tab}
          onChange={setTab}
          label={t('cleanup.tabsLabel')}
          tabs={[
            { key: 'senders', label: t('cleanup.tab.senders'), content: <SendersTab accountId={accountId} /> },
            { key: 'large', label: t('cleanup.tab.large'), content: <LargeTab accountId={accountId} /> },
          ]}
        />
      ) : (
        <EmptyState title={t('cleanup.noAccount')} />
      )}
    </div>
  )
}
