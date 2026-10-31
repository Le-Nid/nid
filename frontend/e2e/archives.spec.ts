import type { Page, Request } from '@playwright/test'
import { test, expect, t, ACCOUNT } from './mock-api'

// Archives (L5, §7.5). Roles, labels and i18n strings only; desktop and mobile projects.

const MORNING = 'Édition du matin archivée'
const INVOICE = "Votre facture d'août"
const is = (method: string, path: string) => (r: Request) => r.method() === method && new URL(r.url()).pathname === path
const results = (page: Page) => page.getByText(/résultats? · 0,12 s/)

test.describe('Archives', () => {
  test('search shows highlighted results and their count', async ({ page }) => {
    await page.goto('/archives')
    await expect(page.getByRole('heading', { level: 1, name: t('archives.title') })).toBeVisible()
    await expect(page.getByText(/Dernière sauvegarde .* · 617 mails · 5 Go/)).toBeVisible()
    await expect(results(page)).toHaveText('2 résultats · 0,12 s')

    await page.getByRole('searchbox', { name: t('archives.search') }).fill('facture')
    await expect(page).toHaveURL(/\?q=facture$/)
    await expect(results(page)).toHaveText('1 résultat · 0,12 s')
    await expect(page.locator('mark').filter({ hasText: 'facture' })).toBeVisible()
    await expect(page.getByText(MORNING)).toHaveCount(0)
  })

  test('filters by label', async ({ page, isMobile }) => {
    await page.goto('/archives')
    await expect(results(page)).toHaveText('2 résultats · 0,12 s')
    if (isMobile) {
      await page.getByRole('button', { name: t('archives.filters') }).click()
      const sheet = page.getByRole('dialog', { name: t('archives.filters') })
      await sheet.getByLabel(t('archives.filter.label')).selectOption('Label_1')
      await sheet.getByRole('button', { name: t('archives.showResults') }).click()
    } else {
      await page.getByRole('tree', { name: t('archives.labelTree') }).getByRole('treeitem', { name: /Factures/ }).click()
    }
    await expect(page).toHaveURL(/label=Label_1/)
    await expect(results(page)).toHaveText('1 résultat · 0,12 s')
    await expect(page.getByText(MORNING)).toHaveCount(0)
  })

  test('opens the reader and shares a link, then revokes it', async ({ page }) => {
    await page.goto('/archives')
    await page.getByRole('button', { name: MORNING, exact: true }).click()
    const reader = page.getByRole('dialog', { name: MORNING })
    await expect(reader.getByText('Les titres du jour')).toBeVisible()
    await reader.getByRole('toolbar').getByRole('button', { name: t('archives.action.share') }).click()

    const dialog = page.getByRole('dialog', { name: t('archives.share.title') })
    const create = page.waitForRequest(is('POST', '/api/shares'))
    await dialog.getByRole('button', { name: t('archives.share.create') }).click()
    expect((await create).postDataJSON()).toMatchObject({ archivedMailId: '0b7c1a52-6f1e-4c55-9a51-3f0f6c1d0a01', expiresInHours: 24 })
    await expect(dialog.getByLabel(t('archives.share.link'))).toHaveValue(/\/shared\/bbbb$/)

    await page.goto('/archives?tab=shares')
    const revoke = page.waitForRequest(is('DELETE', '/api/shares/share-1'))
    await page.getByRole('button', { name: t('archives.share.revoke', { name: INVOICE }) }).click()
    await revoke
  })

  test('tags: add to the selection, filter by tag', async ({ page, isMobile }) => {
    await page.goto('/archives')
    await page.getByRole('checkbox', { name: t('dataList.selectRow', { label: MORNING }) }).check()
    await page.getByRole('toolbar', { name: t('bulkBar.label') }).getByRole('button', { name: t('archives.tags.title') }).click()
    const dialog = page.getByRole('dialog', { name: t('archives.tags.title') })
    await dialog.getByLabel(t('archives.tags.field')).fill('énergie, 2026')
    const tag = page.waitForRequest(is('POST', `/api/archive/${ACCOUNT}/mails/tags`))
    await dialog.getByRole('button', { name: t('archives.tags.addAction') }).click()
    expect((await tag).postDataJSON()).toMatchObject({ add: ['énergie', '2026'] })

    const list = page.waitForRequest((req) => req.url().includes('/mails?') && new URL(req.url()).searchParams.get('tag') === 'impôts')
    if (isMobile) {
      await page.getByRole('button', { name: t('archives.filters') }).click()
      await page.getByRole('dialog', { name: t('archives.filters') }).getByLabel(t('archives.filter.tag')).selectOption('impôts')
    } else {
      await page.getByRole('tree', { name: t('archives.tags.title') }).getByRole('treeitem', { name: /impôts/ }).click()
    }
    await list
  })

  test('« Supprimer » moves to the archive trash at once, « Annuler » restores', async ({ page }) => {
    await page.goto('/archives')
    await page.getByRole('checkbox', { name: t('dataList.selectRow', { label: MORNING }) }).check()
    const trash = page.waitForRequest(is('POST', `/api/archive/${ACCOUNT}/mails/trash`))
    await page.getByRole('toolbar', { name: t('bulkBar.label') }).getByRole('button', { name: t('archives.action.trash') }).click()
    const ids = (await trash).postDataJSON().mailIds
    const restore = page.waitForRequest(is('POST', `/api/archive/${ACCOUNT}/mails/restore`))
    await page.getByRole('button', { name: t('undoToast.undo'), exact: true }).click()
    expect((await restore).postDataJSON()).toEqual({ mailIds: ids })
  })

  test('Corbeille: restore, and empty after confirmation', async ({ page }) => {
    await page.goto('/archives?tab=trash')
    await expect(page.getByText('1 mail dans la corbeille')).toBeVisible()
    const restore = page.waitForRequest(is('POST', `/api/archive/${ACCOUNT}/mails/restore`))
    await page.getByRole('button', { name: t('archives.trash.restoreOne', { subject: "Soldes d'été" }) }).click()
    expect((await restore).postDataJSON()).toEqual({ mailIds: ['0b7c1a52-6f1e-4c55-9a51-3f0f6c1d0a03'] })

    await page.getByRole('button', { name: t('archives.trash.empty') }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Supprimer définitivement 1 archive ?' })
    const empty = page.waitForRequest(is('DELETE', `/api/archive/${ACCOUNT}/trash`))
    await dialog.getByRole('button', { name: 'Supprimer définitivement 1 archive' }).click()
    await empty
    await expect(dialog).toBeHidden()
  })

  test('Rétention: creates a policy on a label', async ({ page }) => {
    await page.goto('/archives?tab=retention')
    await expect(page.getByRole('button', { name: 'Vieilles promos', exact: true })).toBeVisible()
    await page.getByRole('button', { name: t('archives.retention.new') }).click()
    const sheet = page.getByRole('dialog', { name: t('archives.retention.createTitle') })
    await sheet.getByLabel(t('archives.retention.col.name')).fill('Factures anciennes')
    await sheet.getByLabel(t('archives.retention.col.label')).selectOption('Label_1')
    await sheet.getByLabel(t('archives.retention.maxAgeDays')).fill('730')
    const create = page.waitForRequest(is('POST', '/api/retention'))
    await sheet.getByRole('button', { name: t('common.create') }).click()
    expect((await create).postDataJSON()).toEqual({ name: 'Factures anciennes', gmailAccountId: ACCOUNT, label: 'Label_1', maxAgeDays: 730 })
    await expect(sheet).toBeHidden()
  })
})
