import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Tabs } from 'radix-ui'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState } from '@/components/app/EmptyState'
import { RuleSheet, userLabels, type RuleSheetTarget } from '@/components/app/RuleSheet'
import { useAccount } from '@/hooks/useAccount'
import { useLabels } from '@/hooks/queries'
import { RulesTab } from './rules/RulesTab'
import { LabelsTab } from './rules/LabelsTab'

const TABS = ['rules', 'labels'] as const

/** /rules « Règles & libellés » (§7.4, §7.9). Tab in the URL (§3.3); `?new=1` (command palette) opens a new rule. */
export default function RulesPage() {
  const { t } = useTranslation()
  const { accountId } = useAccount()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'labels' ? 'labels' : 'rules'
  const labelCount = userLabels(useLabels(accountId).data ?? []).length
  const [sheet, setSheet] = useState<RuleSheetTarget | null>(null)

  // Opened each time ?new appears, also when already on the page
  const wantsNew = params.has('new')
  const [prevNew, setPrevNew] = useState(false)
  if (wantsNew !== prevNew) {
    setPrevNew(wantsNew)
    if (wantsNew) setSheet({})
  }
  const closeSheet = () => {
    setSheet(null)
    if (wantsNew) setParams(tab === 'labels' ? { tab } : {}, { replace: true })
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader
        title={t('rules.title')}
        description={t(tab === 'labels' ? 'rules.labelsTab.description' : 'rules.description')}
        actions={accountId && (
          <Button className="h-11 md:h-9" onClick={() => setSheet({})}><Plus aria-hidden="true" />{t('rules.newRule')}</Button>
        )}
      />
      {accountId ? (
        <>
          <Tabs.Root value={tab} onValueChange={(next) => setParams(next === 'rules' ? {} : { tab: next })} className="flex flex-col gap-4">
            <Tabs.List aria-label={t('rules.tabsLabel')} className="flex gap-1 overflow-x-auto border-b">
              {TABS.map((key) => (
                <Tabs.Trigger
                  key={key}
                  value={key}
                  className="-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=active]:border-primary data-[state=active]:text-foreground"
                >
                  {t(`rules.tab.${key}`)}
                  {key === 'labels' && labelCount > 0 && (
                    <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{labelCount}</span>
                  )}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="rules" className="focus-visible:outline-none"><RulesTab accountId={accountId} onEdit={setSheet} /></Tabs.Content>
            <Tabs.Content value="labels" className="focus-visible:outline-none"><LabelsTab accountId={accountId} onEdit={setSheet} /></Tabs.Content>
          </Tabs.Root>
          <RuleSheet accountId={accountId} target={sheet} onClose={closeSheet} />
        </>
      ) : (
        <EmptyState title={t('rules.noAccount')} />
      )}
    </div>
  )
}
