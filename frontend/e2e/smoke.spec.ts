import { test, expect, t, ACCOUNT } from './mock-api'

// Selectors are roles, labels and i18n strings only: this suite must survive the antd → shadcn rewrite.

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: 'Unauthorized' } }))
  })

  test('unauthenticated visit redirects to the login form', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('tab', { name: t('login.tabLogin') })).toBeVisible()
    await expect(page.getByLabel(t('login.email'))).toBeVisible()
    await expect(page.getByLabel(t('login.password'))).toBeVisible()
    await expect(page.getByRole('button', { name: t('login.submit') })).toBeVisible()
  })

  test('shows the server error on bad credentials', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 401, json: { error: 'Identifiants invalides' } }))
    await page.goto('/login')
    await page.getByLabel(t('login.email')).fill('alice@example.com')
    await page.getByLabel(t('login.password')).fill('wrong-password')
    await page.getByRole('button', { name: t('login.submit') }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Identifiants invalides' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })
})

test('Dashboard', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: t('dashboard.title') })).toBeVisible()
  await expect(page.getByText('Album vacances')).toBeVisible()
  await expect(page.getByRole('button', { name: t('common.refresh') })).toBeVisible()
})

test.describe('MailManager', () => {
  test('lists mails', async ({ page }) => {
    await page.goto('/mails')
    await expect(page.getByRole('heading', { name: t('mailManager.title') })).toBeVisible()
    await expect(page.getByRole('row', { name: /Facture d'octobre/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Réunion de lundi/ })).toBeVisible()
    await expect(page.getByRole('button', { name: t('mailManager.archiveAll') })).toBeVisible()
  })

  test('selecting rows shows the bulk action bar', async ({ page }) => {
    await page.goto('/mails')
    await page.getByRole('row', { name: /Facture d'octobre/ }).getByRole('checkbox').check()
    const bar = page.getByRole('toolbar', { name: t('bulk.selected', { count: 1 }) })
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('button', { name: t('bulk.trash') })).toBeVisible()

    await page.getByRole('row', { name: /Réunion de lundi/ }).getByRole('checkbox').check()
    await expect(page.getByRole('toolbar', { name: t('bulk.selected', { count: 2 }) })).toBeVisible()
  })

  test('row menu "trash" sends a bulk operation for that row only', async ({ page, api }) => {
    await page.goto('/mails')
    // Another row is checked: the row menu must still target its own row, not the selection.
    await page.getByRole('row', { name: /Réunion de lundi/ }).getByRole('checkbox').check()

    const row = page.getByRole('row', { name: /Facture d'octobre/ })
    // shortcut: the row-menu trigger is an icon button with no accessible name, so it is found as the row's only button; give it an aria-label during the rewrite.
    await row.getByRole('button').click()
    const bulk = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith(`/api/gmail/${ACCOUNT}/messages/bulk`))
    await page.getByRole('menuitem', { name: t('mailManager.trashAction') }).click()

    expect((await bulk).postDataJSON()).toMatchObject({ action: 'trash', messageIds: ['m1'] })
    expect(api.requests.filter((r) => r.url().endsWith('/messages/bulk'))).toHaveLength(1)
  })
})

test('Archive', async ({ page }) => {
  await page.goto('/archive')
  await expect(page.getByRole('heading', { name: t('archive.title') })).toBeVisible()
  await expect(page.getByText('Édition du matin archivée')).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: t('common.search') })).toBeVisible()
})

test('Rules', async ({ page }) => {
  await page.goto('/rules')
  await expect(page.getByRole('heading', { name: t('rules.title') })).toBeVisible()
  await expect(page.getByText('Nettoyer les promos')).toBeVisible()
  await expect(page.getByRole('button', { name: t('rules.newRule') })).toBeVisible()
})

test('Jobs', async ({ page }) => {
  await page.goto('/jobs')
  await expect(page.getByRole('heading', { name: t('jobs.title') })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(`${t('jobs.archiveMails')}.*${t('jobs.completed')}`) })).toBeVisible()
  await expect(page.getByRole('button', { name: t('common.refresh') })).toBeVisible()
})

test('Settings', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: t('settings.title') })).toBeVisible()
  await expect(page.getByRole('main').getByText('alice@gmail.com').first()).toBeVisible()
  await expect(page.getByRole('button', { name: t('settings.connectGmail') })).toBeVisible()
})

test('Unsubscribe / Newsletters', async ({ page }) => {
  await page.goto('/unsubscribe')
  await expect(page.getByRole('heading', { name: t('unsubscribe.title') })).toBeVisible()
  await expect(page.getByText('Weekly Digest')).toBeVisible()
  await expect(page.getByRole('button', { name: t('unsubscribe.scan') })).toBeVisible()
})

test('Attachments', async ({ page }) => {
  await page.goto('/attachments')
  await expect(page.getByRole('heading', { name: t('attachments.title') })).toBeVisible()
  await expect(page.getByText('contrat-signe.pdf')).toBeVisible()
  await expect(page.getByRole('button', { name: t('attachments.reload') })).toBeVisible()
})

test('Admin', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: t('admin.title') })).toBeVisible()
  await expect(page.getByText('bob@example.com')).toBeVisible()
  await expect(page.getByRole('button', { name: t('common.edit') })).toBeVisible()
})
