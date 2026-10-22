import type { Page, Request } from '@playwright/test'
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

test.describe('Mails', () => {
  const select = (page: Page, subject: string) => page.getByRole('checkbox', { name: t('dataList.selectRow', { label: subject }) })
  const rowMenu = (page: Page, subject: string) => page.getByRole('button', { name: t('mails.rowActions', { subject }) })
  const bulkBar = (page: Page) => page.getByRole('toolbar', { name: t('bulkBar.label') })
  const isBulk = (r: Request) => r.method() === 'POST' && r.url().endsWith(`/api/gmail/${ACCOUNT}/messages/bulk`)

  test('lists mails', async ({ page }) => {
    await page.goto('/mails')
    await expect(page.getByRole('heading', { name: t('mails.title') })).toBeVisible()
    await expect(page.getByText("Facture d'octobre")).toBeVisible()
    await expect(page.getByText('Réunion de lundi')).toBeVisible()
    await expect(page.getByRole('button', { name: t('mails.saveAllNas') })).toBeVisible()
  })

  test('selecting rows shows the bulk action bar', async ({ page }) => {
    await page.goto('/mails')
    await select(page, "Facture d'octobre").check()
    await expect(bulkBar(page)).toContainText('1 sélectionné')
    await expect(bulkBar(page).getByRole('button', { name: t('mails.action.trash') })).toBeVisible()

    await select(page, 'Réunion de lundi').check()
    await expect(bulkBar(page)).toContainText('2 sélectionnés')
  })

  test('row menu "trash" sends a bulk operation for that row only', async ({ page, api }) => {
    await page.goto('/mails')
    // Another row is checked: the row menu must still target its own row, not the selection.
    await select(page, 'Réunion de lundi').check()

    await rowMenu(page, "Facture d'octobre").click()
    const bulk = page.waitForRequest(isBulk)
    await page.getByRole('menuitem', { name: t('mails.action.trash') }).click()

    expect((await bulk).postDataJSON()).toMatchObject({ action: 'trash', messageIds: ['m1'] })
    expect(api.requests.filter((r) => r.url().endsWith('/messages/bulk'))).toHaveLength(1)
  })

  test('undo toast cancels the delayed job and restores the row', async ({ page }) => {
    await page.goto('/mails')
    await rowMenu(page, "Facture d'octobre").click()
    const bulk = page.waitForRequest(isBulk)
    await page.getByRole('menuitem', { name: t('mails.action.trash') }).click()
    // No delayMs: the server's default 10 s undo window (D1)
    expect((await bulk).postDataJSON()).not.toHaveProperty('delayMs')
    await expect(page.getByText("Facture d'octobre")).toBeHidden()

    const cancel = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().endsWith('/api/jobs/job-bulk'))
    await page.getByRole('button', { name: t('undoToast.undo'), exact: true }).click()
    await cancel
    await expect(page.getByText("Facture d'octobre")).toBeVisible()
  })

  test('« select all results » sends the search query instead of ids', async ({ page }) => {
    await page.route((url) => url.pathname === `/api/gmail/${ACCOUNT}/messages`, (route) => route.fulfill({
      json: { messages: [{ id: 'm1', threadId: 't1' }, { id: 'm2', threadId: 't2' }], resultSizeEstimate: 1234 },
    }))
    await page.goto('/mails?q=from:billing')
    await select(page, "Facture d'octobre").check()
    await select(page, 'Réunion de lundi').check()
    await page.getByRole('button', { name: /Sélectionner les ~1\s?234 résultats/ }).click()
    await expect(bulkBar(page)).toContainText(/~1\s?234 sélectionnés/)

    const bulk = page.waitForRequest(isBulk)
    await bulkBar(page).getByRole('button', { name: t('mails.action.trash') }).click()
    const body = (await bulk).postDataJSON()
    expect(body).toMatchObject({ action: 'trash', query: 'from:billing' })
    expect(body).not.toHaveProperty('messageIds')
  })

  test('remote images stay blocked until « Afficher »', async ({ page }) => {
    let remote = 0
    await page.route('https://tracker.example/**', (route) => {
      remote++
      return route.fulfill({ status: 204 })
    })
    await page.goto('/mails')
    await rowMenu(page, "Facture d'octobre").click()
    await page.getByRole('menuitem', { name: t('mails.action.open') }).click()

    const viewer = page.getByRole('dialog', { name: "Facture d'octobre" })
    await expect(viewer.getByText(t('mails.viewer.remoteBlocked'))).toBeVisible()
    const frame = `iframe[title="${t('mails.viewer.body')}"]`
    await expect(viewer.locator(frame)).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
    await expect(page.frameLocator(frame).getByRole('link', { name: 'Voir la facture' })).toBeVisible()
    expect(remote).toBe(0)

    await viewer.getByRole('button', { name: t('mails.viewer.showRemote') }).click()
    await expect.poll(() => remote).toBeGreaterThan(0)
    await expect(viewer.getByText(t('mails.viewer.remoteBlocked'))).toBeHidden()
  })

  test.describe('mobile', () => {
    test.skip(({ isMobile }) => !isMobile, 'cards and the bottom selection bar are mobile only')

    test('cards, selection bar in place of the bottom nav, toast above it', async ({ page }) => {
      await page.goto('/mails')
      await expect(page.getByRole('table')).toHaveCount(0)
      await expect(page.getByRole('main').getByRole('list').last().getByRole('listitem')).toHaveCount(2)
      const nav = page.getByRole('navigation', { name: t('shell.mainNav') })
      await expect(nav).toBeVisible()

      await select(page, 'Réunion de lundi').check()
      await expect(bulkBar(page)).toBeVisible()
      await expect(nav).toBeHidden()

      await rowMenu(page, "Facture d'octobre").click()
      await page.getByRole('menuitem', { name: t('mails.action.trash') }).click()
      const undo = page.getByRole('button', { name: t('undoToast.undo'), exact: true })
      await expect(undo).toBeVisible()
      // poll: the toast slides in, its final position is what matters
      await expect.poll(async () => {
        const toastBox = await undo.boundingBox()
        const barBox = await bulkBar(page).boundingBox()
        return toastBox!.y + toastBox!.height <= barBox!.y
      }).toBe(true)

      await bulkBar(page).getByRole('button', { name: t('bulkBar.clear') }).click()
      await expect(nav).toBeVisible()
    })
  })
})

test('Archive', async ({ page }) => {
  await page.goto('/archive')
  await expect(page.getByRole('heading', { name: t('archives.title') })).toBeVisible()
  await expect(page.getByText('Édition du matin archivée')).toBeVisible()
})

test.describe('Cleanup', () => {
  const DIGEST = 'Weekly Digest'
  const isSenderDelete = (r: Request) => r.method() === 'POST' && r.url().endsWith(`/api/unsubscribe/${ACCOUNT}/newsletters/digest%40news.test/delete`)
  /** The sender's actions: inline in its row ≥md, in the action sheet <md. */
  const actionsOf = async (page: Page, isMobile: boolean, sender: string) => {
    if (!isMobile) return page.getByRole('row').filter({ hasText: sender })
    await page.getByRole('button', { name: t('cleanup.senderActions', { sender }) }).click()
    return page.getByRole('dialog', { name: sender })
  }

  test('lists senders from the cached scan, sorted, with both tabs', async ({ page, api }) => {
    await page.goto('/cleanup')
    await expect(page.getByRole('heading', { name: t('cleanup.title') })).toBeVisible()
    await expect(page.getByRole('tab', { name: t('cleanup.tab.senders') })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText(DIGEST)).toBeVisible()
    await expect(page.getByText('Equipe Projet')).toBeVisible()
    // Reading the page never scans the mailbox
    expect(api.requests.filter((r) => r.url().includes('/scan'))).toHaveLength(0)

    // click, not check(): the filter lives in the URL, updated in a transition
    await page.getByRole('checkbox', { name: t('cleanup.newslettersOnly') }).click()
    await expect(page.getByRole('checkbox', { name: t('cleanup.newslettersOnly') })).toBeChecked()
    await expect(page.getByText('Equipe Projet')).toBeHidden()
    await expect(page).toHaveURL(/only=newsletters/)

    await page.getByRole('tab', { name: t('cleanup.tab.large') }).click()
    await expect(page).toHaveURL(/tab=large/)
    await expect(page.getByText('video-vacances.mp4')).toBeVisible()
    await expect(page.getByRole('link', { name: t('cleanup.large.download', { name: 'devis.pdf' }) })).toHaveAttribute('href', /live\/m8\/download/)
  })

  test('unsubscribe asks for confirmation, opens the link, then trashes with undo', async ({ page, isMobile, context }) => {
    await context.route('https://news.test/**', (route) => route.fulfill({ body: 'unsubscribed' }))
    await page.goto('/cleanup')
    const actions = await actionsOf(page, isMobile, DIGEST)
    await actions.getByRole('button', { name: t('cleanup.action.unsubscribe') }).click()
    const dialog = page.getByRole('alertdialog', { name: t('cleanup.confirm.title', { sender: DIGEST }) })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: t('common.cancel') })).toBeFocused()

    const popup = context.waitForEvent('page')
    const del = page.waitForRequest(isSenderDelete)
    await dialog.getByRole('button', { name: /Se désabonner et supprimer 12 mails/ }).click()
    expect((await popup).url()).toContain('news.test/unsub')
    expect((await del).postDataJSON()).not.toHaveProperty('delayMs')
    await expect(page.getByRole('button', { name: t('undoToast.undo'), exact: true })).toBeVisible()
  })

  test('« Tout supprimer » has no dialog and « Annuler » cancels the delayed job', async ({ page, isMobile }) => {
    await page.goto('/cleanup')
    const actions = await actionsOf(page, isMobile, DIGEST)
    const del = page.waitForRequest(isSenderDelete)
    await actions.getByRole('button', { name: t('cleanup.action.deleteAll') }).click()
    await del
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByRole('progressbar', { name: /Suppression de 12 mails de Weekly Digest/ })).toBeVisible()

    const cancel = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().endsWith('/api/jobs/job-sender'))
    await page.getByRole('button', { name: t('undoToast.undo'), exact: true }).click()
    await cancel
    await expect(page.getByRole('progressbar')).toHaveCount(0)
  })

  test('sender without List-Unsubscribe: unsubscribe disabled with the reason (D3)', async ({ page, isMobile }) => {
    await page.goto('/cleanup')
    const actions = await actionsOf(page, isMobile, 'Equipe Projet')
    const button = actions.getByRole('button', { name: t('cleanup.action.unsubscribe') })
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveAccessibleDescription(t('cleanup.noUnsubscribe'))
    await button.click({ force: true })
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(actions.getByRole('button', { name: t('cleanup.action.deleteAll') })).toBeEnabled()
  })

  test('« Toujours faire ça » opens the rule sheet on the sender, with the preview (I3)', async ({ page, isMobile }) => {
    await page.goto('/cleanup')
    const actions = await actionsOf(page, isMobile, DIGEST)
    await actions.getByRole('button', { name: t('cleanup.action.rule') }).click()
    const sheet = page.getByRole('dialog', { name: t('rules.sheet.createTitle') })
    await expect(sheet.getByLabel(t('rules.sheet.from'))).toHaveValue('digest@news.test')
    await expect(sheet.getByText('12 mails concernés · 3 Mo')).toBeVisible()
    await expect(sheet.getByText('Les nouvelles de la semaine')).toBeVisible()
    await expect(sheet.getByRole('link', { name: 'Voir les 12 mails' })).toHaveAttribute('href', '/mails?q=from%3A(digest%40news.test)')
    const create = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith(`/api/rules/${ACCOUNT}`))
    await sheet.getByRole('button', { name: t('rules.sheet.create') }).click()
    expect((await create).postDataJSON()).toMatchObject({
      conditions: [{ field: 'from', operator: 'contains', value: 'digest@news.test' }], action: { type: 'trash' }, schedule: 'daily',
    })
    await expect(sheet).toBeHidden()
  })

  test('never scanned: empty state with « Analyser la boîte »', async ({ page }) => {
    await page.route((url) => url.pathname === `/api/unsubscribe/${ACCOUNT}/newsletters`, (route) => route.fulfill({ json: { senders: [], scannedAt: null } }))
    await page.goto('/cleanup')
    await expect(page.getByText(t('cleanup.never.title'))).toBeVisible()
    const scan = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/scan'))
    await page.getByRole('button', { name: t('cleanup.scan') }).click()
    await scan
    await expect(page.getByRole('progressbar', { name: t('cleanup.scanning') })).toBeVisible()
  })

  test('mobile: cards, no table', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'cards are mobile only')
    await page.goto('/cleanup')
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByRole('tablist', { name: t('cleanup.tabsLabel') })).toBeVisible()
    await expect(page.getByRole('main').getByRole('list').last().getByRole('listitem')).toHaveCount(2)
  })
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
