import type { Page, Request } from '@playwright/test'
import { test, expect, t, ACCOUNT } from './mock-api'

// Règles & libellés (L7, §7.4, §7.9). Roles, labels and i18n strings only.

const PROMOS = 'Nettoyer les promos'
const rowMenu = (page: Page, name: string) => page.getByRole('button', { name: t('rules.rowActions', { name }) })
const is = (method: string, path: string) => (r: Request) => r.method() === method && new URL(r.url()).pathname === path

test.describe('Règles', () => {
  test('lists rules in plain language with their state', async ({ page }) => {
    await page.goto('/rules')
    await expect(page.getByRole('heading', { level: 1, name: t('rules.title') })).toBeVisible()
    await expect(page.getByRole('tab', { name: t('rules.tab.rules') })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('de promo', { exact: true })).toBeVisible()
    await expect(page.getByRole('switch', { name: t('rules.toggle', { name: PROMOS }) })).toBeChecked()
  })

  test('creates a rule with the live preview', async ({ page }) => {
    await page.goto('/rules')
    await page.getByRole('button', { name: t('rules.newRule') }).click()
    const sheet = page.getByRole('dialog', { name: t('rules.sheet.createTitle') })
    await expect(sheet.getByText(t('rules.sheet.needCondition'))).toBeVisible()
    await sheet.getByLabel(t('rules.sheet.name')).fill('Digest')
    await sheet.getByLabel(t('rules.sheet.from')).fill('digest@news.test')
    await sheet.getByRole('radio', { name: t('rules.sheet.ages.30d') }).check()
    await expect(sheet.getByText('12 mails concernés · 3 Mo')).toBeVisible()
    await sheet.getByRole('radio', { name: t('rules.action.archive') }).check()

    const create = page.waitForRequest(is('POST', `/api/rules/${ACCOUNT}`))
    await sheet.getByRole('button', { name: t('rules.sheet.create') }).click()
    expect((await create).postDataJSON()).toEqual({
      name: 'Digest',
      conditions: [{ field: 'from', operator: 'contains', value: 'digest@news.test' }, { field: 'older_than', operator: 'gt', value: '30d' }],
      action: { type: 'archive' }, schedule: 'daily', is_active: true,
    })
    await expect(sheet).toBeHidden()
  })

  test('edits a rule from its row', async ({ page }) => {
    await page.goto('/rules')
    await page.getByRole('button', { name: PROMOS, exact: true }).click()
    const sheet = page.getByRole('dialog', { name: t('rules.sheet.editTitle') })
    await expect(sheet.getByLabel(t('rules.sheet.from'))).toHaveValue('promo')
    await sheet.getByRole('radio', { name: t('rules.schedule.weekly') }).check()
    const update = page.waitForRequest(is('PUT', `/api/rules/${ACCOUNT}/r1`))
    await sheet.getByRole('button', { name: t('rules.sheet.save') }).click()
    expect((await update).postDataJSON()).toMatchObject({ name: PROMOS, schedule: 'weekly', action: { type: 'trash' } })
  })

  test('toggles a rule', async ({ page }) => {
    await page.goto('/rules')
    const toggle = page.waitForRequest(is('PATCH', `/api/rules/${ACCOUNT}/r1/toggle`))
    await page.getByRole('switch', { name: t('rules.toggle', { name: PROMOS }) }).click()
    await toggle
  })

  test('runs a rule after the undo window, « Annuler » cancels it (D1)', async ({ page }) => {
    await page.goto('/rules')
    await rowMenu(page, PROMOS).click()
    const run = page.waitForRequest(is('POST', `/api/rules/${ACCOUNT}/r1/run`))
    await page.getByRole('menuitem', { name: t('rules.menu.run') }).click()
    expect((await run).postDataJSON()).not.toHaveProperty('delayMs')
    const cancel = page.waitForRequest(is('DELETE', '/api/jobs/job-rule'))
    await page.getByRole('button', { name: t('undoToast.undo'), exact: true }).click()
    await cancel
  })

  test('deletes a rule after confirmation', async ({ page }) => {
    await page.goto('/rules')
    await rowMenu(page, PROMOS).click()
    await page.getByRole('menuitem', { name: t('rules.menu.delete') }).click()
    const dialog = page.getByRole('alertdialog', { name: t('rules.confirmDelete.title', { name: PROMOS }) })
    const del = page.waitForRequest(is('DELETE', `/api/rules/${ACCOUNT}/r1`))
    await dialog.getByRole('button', { name: t('rules.confirmDelete.action') }).click()
    await del
    await expect(dialog).toBeHidden()
  })

  test('mobile: cards, no table', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'cards are mobile only')
    await page.goto('/rules')
    await expect(page.getByRole('button', { name: PROMOS, exact: true })).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })
})

test.describe('Libellés', () => {
  test('creates a label and its rule from a template; an active one edits its rule', async ({ page }) => {
    await page.goto('/rules?tab=labels')
    await expect(page.getByText(t('rules.labelsTab.description'))).toBeVisible()
    const invoices = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Factures' }) })
    await expect(invoices.getByText(t('rules.labelsTab.active'))).toBeVisible()

    const bank = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Banque' }) })
    const apply = page.waitForRequest(is('POST', `/api/rules/${ACCOUNT}/from-template`))
    await bank.getByRole('button', { name: t('rules.labelsTab.createBoth') }).click()
    expect((await apply).postDataJSON()).toEqual({ templateId: 'label-bank' })

    await invoices.getByRole('button', { name: t('rules.labelsTab.editRule') }).click()
    await expect(page.getByRole('dialog', { name: t('rules.sheet.editTitle') })).toBeVisible()
  })

  test('renames a label', async ({ page }) => {
    await page.goto('/rules?tab=labels')
    await page.getByRole('button', { name: t('rules.labelsTab.menu', { name: 'Factures' }) }).click()
    await page.getByRole('menuitem', { name: t('rules.labelsTab.rename') }).click()
    const dialog = page.getByRole('dialog', { name: t('rules.labelsTab.renameTitle', { name: 'Factures' }) })
    await dialog.getByLabel(t('rules.labelsTab.name')).fill('Factures/2026')
    const rename = page.waitForRequest(is('PATCH', `/api/gmail/${ACCOUNT}/labels/Label_1`))
    await dialog.getByRole('button', { name: t('common.save') }).click()
    expect((await rename).postDataJSON()).toEqual({ name: 'Factures/2026' })
    await expect(dialog).toBeHidden()
  })
})
