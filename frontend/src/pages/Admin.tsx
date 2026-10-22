import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/app/PageHeader'
import { PageTabs } from '@/components/app/PageTabs'
import { UsersTab } from './admin/UsersTab'
import { SystemTab } from './admin/SystemTab'
import { AuditTab } from './admin/AuditTab'

const TABS = ['users', 'system', 'audit']

/** /admin (§7.8, D7): Utilisateurs, Système, Audit; tab in the URL (§3.3). Reached through AdminRoute only. */
export default function AdminPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((k) => k === params.get('tab')) ?? 'users'

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-4 md:px-6 md:pt-8">
      <PageHeader title={t('admin.title')} />
      {/* Each tab keeps its own filters: switching drops the other tab's params */}
      <PageTabs
        value={tab}
        onChange={(next) => setParams(next === 'users' ? {} : { tab: next })}
        label={t('admin.tabsLabel')}
        tabs={[
          { key: 'users', label: t('admin.tab.users'), content: <UsersTab /> },
          { key: 'system', label: t('admin.tab.system'), content: <SystemTab /> },
          { key: 'audit', label: t('admin.tab.audit'), content: <AuditTab /> },
        ]}
      />
    </div>
  )
}
