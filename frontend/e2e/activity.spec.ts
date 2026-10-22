import type { Page, Request } from '@playwright/test'
import { test, expect, t } from './mock-api'

// Activité (L9a, §7.6). Roles, labels and i18n strings only; desktop table and mobile cards alike.

const BULK = t('jobs.bulkOperation')
const NAS = t('jobs.archiveMails')
const chip = (page: Page, key: string) => page.getByRole('group', { name: t('activity.filterLabel') }).getByRole('button', { name: new RegExp(`^${t(`activity.chip.${key}`)}`) })
const action = (page: Page, key: string, label: string) => page.getByRole('main').getByRole('button', { name: `${t(`activity.action.${key}`)} : ${label}` })
const is = (method: string, path: string) => (r: Request) => r.method() === method && new URL(r.url()).pathname === path

test.describe('Activité', () => {
  test('chips show the counts and filter the list', async ({ page }) => {
    await page.goto('/activity')
    await expect(page.getByRole('heading', { level: 1, name: t('activity.title') })).toBeVisible()
    await expect(chip(page, 'all')).toHaveText(/3$/)
    await expect(chip(page, 'all')).toHaveAttribute('aria-pressed', 'true')
    await expect(chip(page, 'failed')).toHaveText(/1$/)
    await expect(page.getByText(t('activity.footer', { count: 3, total: 3 }))).toBeVisible()

    const filtered = page.waitForRequest((r) => is('GET', '/api/jobs')(r) && new URL(r.url()).searchParams.get('status') === 'failed')
    await chip(page, 'failed').click()
    await filtered
    await expect(page).toHaveURL(/status=failed/)
    await expect(action(page, 'retry', NAS)).toBeVisible()
    await expect(action(page, 'cancel', BULK)).toBeHidden()
  })

  test('cancels a scheduled job', async ({ page }) => {
    await page.goto('/activity')
    const cancel = page.waitForRequest(is('DELETE', '/api/jobs/j2'))
    await action(page, 'cancel', BULK).click()
    await cancel
  })

  test('retries a failed job', async ({ page }) => {
    await page.goto('/activity?status=failed')
    const retry = page.waitForRequest(is('POST', '/api/jobs/j3/retry'))
    await action(page, 'retry', NAS).click()
    await retry
    await expect(page.getByText(t('activity.retried'))).toBeVisible()
  })

  test('shows the details of a failed job', async ({ page }) => {
    await page.goto('/activity')
    await action(page, 'details', NAS).click()
    const dialog = page.getByRole('dialog', { name: NAS })
    await expect(dialog.getByText('NAS injoignable après 3 tentatives')).toBeVisible()
    await dialog.getByRole('button', { name: t('common.close') }).click()
    await expect(dialog).toBeHidden()
  })

  test('« Voir » opens the page of a finished job', async ({ page }) => {
    await page.goto('/activity')
    await page.getByRole('main').getByRole('link', { name: `${t('activity.action.view')} : ${NAS}` }).click()
    await expect(page).toHaveURL(/\/archives$/)
  })

  test('/jobs?status=failed → /activity with the chip on', async ({ page }) => {
    await page.goto('/jobs?status=failed')
    await expect(page).toHaveURL((url) => url.pathname === '/activity' && url.search === '?status=failed')
    await expect(chip(page, 'failed')).toHaveAttribute('aria-pressed', 'true')
  })
})
