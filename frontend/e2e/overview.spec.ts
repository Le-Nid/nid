import type { Page } from '@playwright/test'
import { test, expect, t } from './mock-api'

// Vue d'ensemble (L8, §7.1). Roles, labels and i18n strings only.

const kpi = (page: Page, key: string) => page.getByRole('link', { name: new RegExp(`^${t(`overview.kpi.${key}`)}`) })
const suggestion = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text })
const DIGEST = 'Weekly Digest vous a envoyé 12 mails que vous lisez peu.'

test.describe("Vue d'ensemble", () => {
  test('KPI, top senders, suggestions and running jobs', async ({ page }) => {
    await page.goto('/overview')
    await expect(page.getByRole('heading', { level: 1, name: t('overview.greeting', { name: 'Alice' }) })).toBeVisible()
    await expect(kpi(page, 'mails')).toContainText('1 234')
    await expect(kpi(page, 'rules')).toContainText(/1\s284 mails traités ces 30 derniers jours/)
    await expect(kpi(page, 'backup')).toContainText(/50\s%/)
    const top = page.getByRole('region', { name: t('overview.top.title') })
    await expect(top.getByRole('listitem').first()).toContainText('Weekly Digest')
    await expect(suggestion(page, DIGEST)).toBeVisible()
    await expect(page.getByText(t('overview.jobs.empty'))).toBeVisible()
  })

  for (const [key, path, title] of [
    ['mails', '/mails', 'mails.title'],
    ['recoverable', '/cleanup', 'cleanup.title'],
    ['backup', '/archives', 'archives.title'],
    ['rules', '/rules', 'rules.title'],
  ]) {
    test(`KPI ${key} → ${path}`, async ({ page }) => {
      await page.goto('/overview')
      await kpi(page, key).click()
      await expect(page).toHaveURL(path)
      await expect(page.getByRole('heading', { level: 1, name: t(title) })).toBeVisible()
    })
  }

  test('« Ignorer » dismisses the suggestion', async ({ page }) => {
    await page.goto('/overview')
    const dismiss = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/api/analytics/suggestions/sug-1/dismiss'))
    await suggestion(page, DIGEST).getByRole('button', { name: t('overview.suggestions.dismiss') }).click()
    await dismiss
  })

  test('« Toujours faire ça » opens the rule sheet for the sender', async ({ page }) => {
    await page.goto('/overview')
    await suggestion(page, DIGEST).getByRole('button', { name: t('cleanup.action.rule') }).click()
    const sheet = page.getByRole('dialog', { name: t('rules.sheet.createTitle') })
    await expect(sheet.getByLabel(t('rules.sheet.from'))).toHaveValue('digest@news.test')
  })

  test('live counters (B3) update the KPI', async ({ page }) => {
    await page.route((url) => url.pathname === '/api/events', (route) => route.fulfill({
      contentType: 'text/event-stream',
      body: `event: counters\ndata: ${JSON.stringify({ mails: { 'acc-1': 48212 }, activeRules: 7, activeJobs: 0 })}\n\n`,
    }))
    await page.goto('/overview')
    await expect(kpi(page, 'mails')).toContainText('48 212')
    await expect(kpi(page, 'rules')).toContainText(/^Règles actives\s*7/)
  })
})
