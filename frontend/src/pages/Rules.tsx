import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState } from '@/components/app/EmptyState'
import { PageTabs } from '@/components/app/PageTabs'
import { RuleSheet, userLabels, type RuleSheetTarget } from '@/components/app/RuleSheet'
import { useAccount } from '@/hooks/useAccount'
import { useLabels } from '@/hooks/queries'
import { RulesTab } from './rules/RulesTab'
import { LabelsTab } from './rules/LabelsTab'

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
          <PageTabs
            value={tab}
            onChange={(next) => setParams(next === 'rules' ? {} : { tab: next })}
            label={t('rules.tabsLabel')}
            tabs={[
              { key: 'rules', label: t('rules.tab.rules'), content: <RulesTab accountId={accountId} onEdit={setSheet} /> },
              {
                key: 'labels',
                label: (
                  <>
                    {t('rules.tab.labels')}
                    {labelCount > 0 && <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{labelCount}</span>}
                  </>
                ),
                content: <LabelsTab accountId={accountId} onEdit={setSheet} />,
              },
            ]}
          />
          <RuleSheet accountId={accountId} target={sheet} onClose={closeSheet} />
        </>
      ) : (
        <EmptyState title={t('rules.noAccount')} />
      )}
    </div>
  )
}
