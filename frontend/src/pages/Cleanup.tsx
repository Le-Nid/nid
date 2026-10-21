import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Tabs } from 'radix-ui'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState } from '@/components/app/EmptyState'
import { useAccount } from '@/hooks/useAccount'
import { useNewsletters } from '@/hooks/queries'
import { formatBytes } from '@/utils/format'
import { SendersTab, type NewsletterSender } from './cleanup/SendersTab'
import { LargeTab } from './cleanup/LargeTab'

const TABS = ['senders', 'large'] as const
type Tab = (typeof TABS)[number]
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
  const tab: Tab = params.get('tab') === 'large' ? 'large' : 'senders'
  const summary = useSummary(accountId)

  // Each tab keeps its own filters: switching drops the other tab's params
  const setTab = (next: string) => setParams(next === 'senders' ? {} : { tab: next })

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader title={t('cleanup.title')} description={summary} />
      {accountId ? (
        <Tabs.Root value={tab} onValueChange={setTab} className="flex flex-col gap-4">
          <Tabs.List aria-label={t('cleanup.tabsLabel')} className="flex gap-1 overflow-x-auto border-b">
            {TABS.map((key) => (
              <Tabs.Trigger
                key={key}
                value={key}
                className="-mb-px min-h-11 shrink-0 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=active]:border-primary data-[state=active]:text-foreground"
              >
                {t(`cleanup.tab.${key}`)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="senders" className="focus-visible:outline-none"><SendersTab accountId={accountId} /></Tabs.Content>
          <Tabs.Content value="large" className="focus-visible:outline-none"><LargeTab accountId={accountId} /></Tabs.Content>
        </Tabs.Root>
      ) : (
        <EmptyState title={t('cleanup.noAccount')} />
      )}
    </div>
  )
}
