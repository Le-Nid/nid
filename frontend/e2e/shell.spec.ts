import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, expect, t } from './mock-api'

// AppShell (L0): redirects §3.3, sidebar, bottom bar, ⌘K palette. Roles and i18n strings only.

const mainNav = (page: Page) => page.getByRole('navigation', { name: t('shell.mainNav') })

const me = JSON.parse(readFileSync(new URL('./fixtures/me.json', import.meta.url), 'utf8'))
const asNonAdmin = (page: Page) =>
  page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...me, user: { ...me.user, role: 'user' } } }))

test.describe('redirects (§3.3)', () => {
  const REDIRECTS: [from: string, to: string, heading: string][] = [
    ['/', '/overview', 'dashboard.title'],
    ['/dashboard', '/overview', 'dashboard.title'],
    ['/archive', '/archives', 'archive.title'],
    ['/jobs', '/activity', 'jobs.title'],
    ['/settings', '/settings/account', 'settings.title'],
  ]
  for (const [from, to, heading] of REDIRECTS) {
    test(`${from} → ${to}`, async ({ page }) => {
      await page.goto(from)
      await expect(page).toHaveURL((url) => url.pathname === to)
      await expect(page.getByRole('heading', { name: t(heading) })).toBeVisible()
    })
  }

  test('keeps the query string (OAuth callback lands on /settings?gmail=…)', async ({ page }) => {
    await page.goto('/settings?gmail=connected')
    await expect(page).toHaveURL((url) => url.pathname === '/settings/account' && url.search === '?gmail=connected')
  })
})

test.describe('desktop sidebar', () => {
  test.skip(({ isMobile }) => isMobile, 'sidebar is desktop only')

  test('navigates and marks the current entry', async ({ page }) => {
    await page.goto('/overview')
    const nav = mainNav(page)
    await expect(nav.getByRole('link', { name: t('shell.overview') })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link')).toHaveCount(8)

    await nav.getByRole('link', { name: t('shell.archives') }).click()
    await expect(page).toHaveURL(/\/archives$/)
    await expect(page.getByRole('heading', { name: t('archive.title') })).toBeVisible()
    await expect(nav.getByRole('link', { name: t('shell.archives') })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: t('shell.overview') })).not.toHaveAttribute('aria-current', 'page')
  })

  test('entries without a new page yet point to the legacy page', async ({ page }) => {
    await page.goto('/overview')
    await mainNav(page).getByRole('link', { name: t('shell.cleanup') }).click()
    await expect(page).toHaveURL(/\/unsubscribe$/)
    await expect(page.getByRole('heading', { name: t('unsubscribe.title') })).toBeVisible()
  })

  test('collapses to icons and keeps named links', async ({ page }) => {
    await page.goto('/overview')
    await page.getByRole('button', { name: t('shell.collapse') }).click()
    await expect(page.getByRole('button', { name: t('shell.expand') })).toHaveAttribute('aria-expanded', 'false')
    await mainNav(page).getByRole('link', { name: t('shell.rules') }).click()
    await expect(page).toHaveURL(/\/rules$/)
  })

  test('hides Admin for non-admins', async ({ page }) => {
    await asNonAdmin(page)
    await page.goto('/overview')
    await expect(mainNav(page).getByRole('link', { name: t('shell.activity') })).toBeVisible()
    await expect(mainNav(page).getByRole('link', { name: t('shell.admin') })).toHaveCount(0)
  })
})

test.describe('mobile bottom bar', () => {
  test.skip(({ isMobile }) => !isMobile, 'bottom bar is mobile only')

  test('navigates between the four destinations', async ({ page }) => {
    await page.goto('/overview')
    const nav = mainNav(page)
    await expect(nav.getByRole('link', { name: t('shell.home') })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: t('shell.mails') }).click()
    await expect(page).toHaveURL(/\/mails$/)
    await expect(page.getByRole('heading', { name: t('mailManager.title') })).toBeVisible()
    await expect(nav.getByRole('link', { name: t('shell.mails') })).toHaveAttribute('aria-current', 'page')
  })

  test('"Plus" opens a sheet with the other destinations', async ({ page }) => {
    await page.goto('/overview')
    const more = mainNav(page).getByRole('button', { name: t('shell.more') })
    await expect(more).toHaveAttribute('aria-haspopup', 'dialog')
    await more.click()

    const sheet = page.getByRole('dialog', { name: t('shell.more') })
    await expect(sheet.getByRole('link', { name: t('shell.rules') })).toBeVisible()
    await expect(sheet.getByRole('link', { name: t('shell.settings') })).toBeVisible()
    await expect(sheet.getByRole('link', { name: t('shell.admin') })).toBeVisible()
    await expect(sheet.getByRole('button', { name: t('shell.logout') })).toBeVisible()

    await sheet.getByRole('link', { name: t('shell.activity') }).click()
    await expect(page).toHaveURL(/\/activity$/)
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('heading', { name: t('jobs.title') })).toBeVisible()
  })

  test('"Plus" hides Admin for non-admins', async ({ page }) => {
    await asNonAdmin(page)
    await page.goto('/overview')
    await mainNav(page).getByRole('button', { name: t('shell.more') }).click()
    const sheet = page.getByRole('dialog', { name: t('shell.more') })
    await expect(sheet.getByRole('link', { name: t('shell.activity') })).toBeVisible()
    await expect(sheet.getByRole('link', { name: t('shell.admin') })).toHaveCount(0)
  })
})

test.describe('command palette', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard shortcut, desktop only')

  test('opens with Ctrl+K and navigates', async ({ page }) => {
    await page.goto('/overview')
    await expect(page.getByRole('heading', { name: t('dashboard.title') })).toBeVisible()
    await page.keyboard.press('Control+K')

    const palette = page.getByRole('dialog', { name: t('shell.palette') })
    await expect(palette).toBeVisible()
    await page.getByRole('combobox', { name: t('shell.palettePlaceholder') }).fill(t('shell.activity'))
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/activity$/)
    await expect(palette).toBeHidden()
  })

  test('opens from the sidebar search button and closes with Escape', async ({ page }) => {
    await page.goto('/overview')
    await page.getByRole('button', { name: t('shell.search') }).click()
    const palette = page.getByRole('dialog', { name: t('shell.palette') })
    await expect(palette.getByRole('option', { name: t('nav.attachments') })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
  })
})
