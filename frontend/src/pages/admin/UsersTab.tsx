import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Pencil, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataList, dataListFeatures } from '@/components/app/DataList'
import { EmptyState } from '@/components/app/EmptyState'
import { FormField } from '@/components/app/FormField'
import { LoadError } from '@/components/app/LoadError'
import { useAdminUsers, useUpdateAdminUser } from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatBytes, formatRelative } from '@/utils/format'
import { actionsHeader } from '../archives/shared'
import { PAGE_SIZE, Pager, selectClass, useTabParams } from './shared'

/** A row of `GET /api/admin/users`. */
type AdminUser = {
  id: string
  email: string
  display_name: string | null
  role: 'admin' | 'user'
  is_active: boolean
  max_gmail_accounts: number
  storage_quota_bytes: number
  storage_used_bytes: number
  gmail_accounts_count: number
  last_login_at: string | null
}

const GB = 1024 ** 3
const toGb = (bytes: number) => String(Math.round((Number(bytes) / GB) * 100) / 100)
const col = createColumnHelper<typeof dataListFeatures, AdminUser>()

function buildColumns(t: TFunction, locale: string, edit: { current: (u: AdminUser) => void }) {
  return col.columns([
    col.accessor('email', {
      header: t('admin.users.col.user'),
      meta: { mobile: 'title' },
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),
    col.accessor('role', { header: t('admin.users.col.role'), meta: { mobile: 'meta' }, cell: ({ getValue }) => t(`admin.users.role.${getValue()}`) }),
    col.accessor('is_active', {
      header: t('admin.users.col.active'),
      meta: { mobile: 'meta' },
      cell: ({ getValue }) => (getValue() ? t('admin.users.active') : <span className="text-destructive">{t('admin.users.inactive')}</span>),
    }),
    col.accessor('gmail_accounts_count', {
      header: t('admin.users.col.accounts'),
      meta: { mobile: 'meta' },
      cell: ({ getValue, row }) => t('admin.users.accounts', { count: getValue(), max: row.original.max_gmail_accounts }),
    }),
    col.accessor('storage_used_bytes', {
      header: t('admin.users.col.storage'),
      meta: { mobile: 'meta' },
      cell: ({ getValue, row }) => t('admin.users.storageOf', { used: formatBytes(Number(getValue())), quota: formatBytes(Number(row.original.storage_quota_bytes)) }),
    }),
    col.accessor('last_login_at', {
      header: t('admin.users.col.lastLogin'),
      meta: { mobile: 'subtitle' },
      cell: ({ getValue }) => {
        const value = getValue()
        return value ? formatRelative(value, locale) : t('admin.users.never')
      },
    }),
    col.display({
      id: 'actions',
      header: actionsHeader(t),
      enableHiding: false,
      meta: { mobile: 'menu', align: 'end' },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={t('admin.users.edit', { email: row.original.email })} onClick={() => edit.current(row.original)}>
          <Pencil aria-hidden="true" />
        </Button>
      ),
    }),
  ])
}

function UserForm({ user, onClose }: Readonly<{ user: AdminUser; onClose: () => void }>) {
  const { t } = useTranslation()
  const id = useId()
  const update = useUpdateAdminUser()
  const [role, setRole] = useState(user.role)
  const [active, setActive] = useState(user.is_active)
  const [maxAccounts, setMaxAccounts] = useState(String(user.max_gmail_accounts))
  const initialGb = toGb(user.storage_quota_bytes)
  const [quotaGb, setQuotaGb] = useState(initialGb)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const updates: Record<string, unknown> = { role, is_active: active, max_gmail_accounts: Number(maxAccounts) }
    // Untouched quota is not resent: the rounded Go value would shift the stored bytes
    if (quotaGb !== initialGb) updates.storage_quota_bytes = Math.round(Number(quotaGb) * GB)
    update.mutate({ userId: user.id, updates }, {
      onSuccess: () => {
        toast.success(t('admin.users.saved'))
        onClose()
      },
      onError: () => toast.error(t('admin.users.failed')),
    })
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{t('admin.users.editTitle')}</SheetTitle>
        <SheetDescription>{user.email}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
        <FormField id={`${id}-role`} label={t('admin.users.col.role')}>
          <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value as AdminUser['role'])} className={selectClass}>
            <option value="user">{t('admin.users.role.user')}</option>
            <option value="admin">{t('admin.users.role.admin')}</option>
          </select>
        </FormField>
        <div className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
          <Checkbox id={`${id}-active`} checked={active} onCheckedChange={(v) => setActive(!!v)} />
          <label htmlFor={`${id}-active`}>{t('admin.users.isActive')}</label>
        </div>
        <FormField id={`${id}-max`} label={t('admin.users.maxAccounts')}>
          <Input id={`${id}-max`} type="number" inputMode="numeric" min={1} max={50} required value={maxAccounts} onChange={(e) => setMaxAccounts(e.target.value)} className="h-11 w-32 text-base md:h-9 md:text-sm" />
        </FormField>
        <FormField id={`${id}-quota`} label={t('admin.users.quotaGb')}>
          <Input id={`${id}-quota`} type="number" inputMode="decimal" min={0} step="any" required value={quotaGb} onChange={(e) => setQuotaGb(e.target.value)} className="h-11 w-32 text-base md:h-9 md:text-sm" />
        </FormField>
      </div>
      <SheetFooter className="pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button type="submit" className="h-11 md:h-9" disabled={update.isPending}>{t('common.save')}</Button>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onClose}>{t('common.cancel')}</Button>
      </SheetFooter>
    </form>
  )
}

/** « Utilisateurs » (§7.8): role, active, accounts, storage, last login; edit in a sheet. */
export function UsersTab() {
  const { t, i18n } = useTranslation()
  const isMobile = useIsMobile()
  const { values, page, set } = useTabParams(['q'] as const)
  const query = useAdminUsers({ page, limit: PAGE_SIZE, search: values.q || undefined })
  const [editing, setEditing] = useState<AdminUser | null>(null)
  // Columns stay stable; the edit button reaches the current setter through this ref
  const edit = useRef(setEditing)
  const columns = useMemo(() => buildColumns(t, i18n.language, edit), [t, i18n.language])
  const users: AdminUser[] = query.data?.users ?? []
  const table = useTable({ features: dataListFeatures, columns, data: users, getRowId: (u) => u.id, enableSorting: false })

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        aria-label={t('admin.users.search')}
        placeholder={t('admin.users.searchPlaceholder')}
        value={values.q}
        onChange={(e) => set({ q: e.target.value })}
        className="h-11 text-base md:h-9 md:max-w-sm md:text-sm"
      />
      {query.isError ? (
        <LoadError message={t('admin.users.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <DataList
          table={table}
          rowLabel={(row) => row.original.email}
          isLoading={query.isLoading}
          empty={<EmptyState icon={<Users />} title={t('admin.users.empty')} />}
        />
      )}
      <Pager page={page} total={query.data?.total ?? 0} onChange={(p) => set({ page: String(p) })} />
      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} showCloseButton={false} className="max-h-[90dvh] sm:max-w-md">
          {editing && <UserForm key={editing.id} user={editing} onClose={() => setEditing(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
