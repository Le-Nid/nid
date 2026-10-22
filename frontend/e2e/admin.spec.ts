import type { Page, Request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, expect, t } from './mock-api'

// Admin (L9, §7.8). Roles, labels and i18n strings only; desktop and mobile projects.

const is = (method: string, path: string) => (r: Request) => r.method() === method && new URL(r.url()).pathname === path
const section = (page: Page, key: string) => page.getByRole('region', { name: t(key) })
const me = JSON.parse(readFileSync(new URL('./fixtures/me.json', import.meta.url), 'utf8'))

test.describe('Admin', () => {
  test('users list and edit in a sheet', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { level: 1, name: t('admin.title') })).toBeVisible()
    await expect(page.getByText('bob@example.com')).toBeVisible()
    await expect(page.getByText(t('admin.users.never'))).toBeVisible()

    await page.getByRole('button', { name: t('admin.users.edit', { email: 'bob@example.com' }) }).click()
    const sheet = page.getByRole('dialog', { name: t('admin.users.editTitle') })
    await sheet.getByLabel(t('admin.users.col.role')).selectOption('admin')
    const patch = page.waitForRequest(is('PATCH', '/api/admin/users/u2'))
    await sheet.getByRole('button', { name: t('common.save') }).click()
    expect((await patch).postDataJSON()).toEqual({ role: 'admin', is_active: true, max_gmail_accounts: 3 })
    await expect(sheet).toBeHidden()
  })

  test('empties the instance trash after a confirmation naming the counts', async ({ page }) => {
    await page.goto('/admin?tab=system')
    const trash = section(page, 'admin.system.trash.title')
    await expect(trash).toContainText(/2\s914 mails · 412 Mo · prochaine purge le 24 octobre/)
    await trash.getByRole('button', { name: t('admin.system.trash.empty') }).click()
    const dialog = page.getByRole('alertdialog', { name: t('admin.system.trash.confirmTitle') })
    await expect(dialog).toContainText(/2\s914 mails \(412 Mo\) seront supprimés du NAS pour tous les utilisateurs/)
    const purge = page.waitForRequest(is('DELETE', '/api/admin/archive-trash'))
    await dialog.getByRole('button', { name: t('admin.system.trash.confirm') }).click()
    await purge
    await expect(dialog).toBeHidden()
  })

  test('sets the instance max duration and runs an integrity check', async ({ page }) => {
    await page.goto('/admin?tab=system')
    const put = page.waitForRequest(is('PUT', '/api/archive/config/trash'))
    await section(page, 'admin.system.trash.title').getByLabel(t('admin.system.trash.maxDuration')).selectOption('90')
    expect((await put).postDataJSON()).toEqual({ retentionDays: 90 })

    const integrity = section(page, 'admin.system.integrity.title')
    await expect(integrity.getByText(t('admin.system.integrity.healthy'))).toBeVisible()
    const run = page.waitForRequest(is('POST', '/api/integrity/check/async'))
    await integrity.getByRole('button', { name: t('admin.system.integrity.run') }).click()
    await run
    await expect(integrity.getByRole('progressbar', { name: t('admin.system.integrity.running') })).toBeVisible()
  })

  test('quota of the instance and jobs of all users', async ({ page }) => {
    await page.goto('/admin?tab=system')
    await expect(section(page, 'admin.system.quota.title')).toContainText('180 / 250 u/s')
    await expect(section(page, 'admin.system.jobs.title')).toContainText('archive_mails')
  })

  test('filters the audit log by action', async ({ page }) => {
    await page.goto('/admin?tab=audit')
    await expect(page.getByText('user.login', { exact: true }).last()).toBeVisible()
    const filtered = page.waitForRequest((r) => is('GET', '/api/admin/audit')(r) && new URL(r.url()).searchParams.get('action') === 'rule.create')
    await page.getByLabel(t('admin.audit.action')).selectOption('rule.create')
    await filtered
    await expect(page).toHaveURL(/action=rule\.create/)
    await expect(page.getByRole('main').getByText('bob@example.com')).toBeVisible()
    await expect(page.getByRole('main').getByText('alice@example.com')).toHaveCount(0)
  })

  test('a non-admin has no nav entry and is sent to the overview', async ({ page, isMobile }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...me, user: { ...me.user, role: 'user' } } }))
    await page.goto('/admin')
    await expect(page).toHaveURL((url) => url.pathname === '/overview')
    const nav = page.getByRole('navigation', { name: t('shell.mainNav') })
    if (isMobile) {
      // « Plus » is a page since L9b
      await nav.getByRole('link', { name: t('shell.more') }).click()
      const main = page.getByRole('main')
      await expect(main.getByRole('link', { name: new RegExp(t('shell.activity')) })).toBeVisible()
      await expect(main.getByRole('heading', { name: t('shell.administration') })).toHaveCount(0)
      await expect(main.getByRole('link', { name: new RegExp(t('shell.admin')) })).toHaveCount(0)
    } else {
      await expect(nav.getByRole('link', { name: t('shell.overview') })).toBeVisible()
      await expect(nav.getByRole('link', { name: t('shell.admin') })).toHaveCount(0)
    }
  })
})
