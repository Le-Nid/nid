import type { Page, Request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, expect, t, ACCOUNT } from './mock-api'

const me = JSON.parse(readFileSync(new URL('./fixtures/me.json', import.meta.url), 'utf8'))
/** /me once the account was disconnected (soft disconnect: the row and its archives stay). */
const asDisconnected = (page: Page) => page.route('**/api/auth/me', (route) =>
  route.fulfill({ json: { ...me, gmailAccounts: me.gmailAccounts.map((a: object) => ({ ...a, is_active: false })) } }))

// Paramètres (L9b, §7.7) and the mobile « Plus » screen. Roles, labels and i18n strings only.

const is = (method: string, path: string) => (r: Request) => r.method() === method && new URL(r.url()).pathname === path

/** Desktop: a tab of the page; mobile: a page of its own reached from « Plus ». */
async function openSection(page: Page, isMobile: boolean, section: string) {
  if (!isMobile) {
    await page.goto('/settings/account')
    await page.getByRole('tab', { name: t(`settings.section.${section}`), exact: true }).click()
  } else {
    await page.goto('/more')
    await page.getByRole('main').getByRole('link', { name: new RegExp(`^${t(`settings.section.${section}`)}(\\s|$)`) }).click()
    await expect(page.getByRole('heading', { level: 1, name: t(`settings.section.${section}`) })).toBeVisible()
  }
  await expect(page).toHaveURL(new RegExp(`/settings/${section}$`))
}

test('each section renders', async ({ page, isMobile }) => {
  const ready: [section: string, heading: string][] = [
    ['account', 'settings.profile'],
    ['security', 'settings.twoFactor.title'],
    ['gmail', 'settings.gmail.sync'],
    ['notifications', 'settings.webhooks.title'],
    ['data', 'settings.data.config'],
    ['about', 'settings.about.transparencyTitle'],
  ]
  for (const [section, heading] of ready) {
    await openSection(page, isMobile, section)
    await expect(page.getByText(t(heading), { exact: true }).first()).toBeVisible()
  }
})

test('switches the theme', async ({ page }) => {
  await page.goto('/settings/account')
  await page.getByRole('radio', { name: t('settings.theme.dark') }).check()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('radio', { name: t('settings.theme.light') }).check()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('changes the backup frequency of a Gmail account (B12)', async ({ page }) => {
  await page.goto('/settings/gmail')
  await expect(page.getByText(t('settings.gmail.synced'))).toBeVisible()
  const patch = page.waitForRequest(is('PATCH', `/api/auth/gmail/${ACCOUNT}`))
  await page.getByLabel(t('settings.gmail.frequency')).selectOption({ label: t('settings.gmail.every.6h') })
  expect((await patch).postDataJSON()).toEqual({ backup_interval: '6h' })
})

test('asks before disconnecting a Gmail account, and keeps the archives', async ({ page }) => {
  await page.goto('/settings/gmail')
  await page.getByRole('button', { name: t('settings.gmail.disconnect') }).click()
  const dialog = page.getByRole('alertdialog', { name: t('settings.gmail.disconnectTitle', { email: 'alice@gmail.com' }) })
  await expect(dialog).toContainText(t('settings.gmail.disconnectDescription'))
  // Focus starts on « Annuler » (D2)
  await expect(dialog.getByRole('button', { name: t('common.cancel') })).toBeFocused()
  const remove = page.waitForRequest(is('DELETE', `/api/auth/gmail/${ACCOUNT}`))
  await asDisconnected(page)
  await dialog.getByRole('button', { name: t('settings.gmail.disconnect') }).click()
  await remove
  await expect(dialog).toBeHidden()
  // Still listed, with its archives, and a way back
  await expect(page.getByText(t('settings.gmail.disconnectedState'), { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: t('settings.gmail.reconnect') })).toBeVisible()
  await expect(page.getByRole('button', { name: t('settings.gmail.disconnect') })).toHaveCount(0)
})

test('a disconnected account keeps its archives but not the Gmail pages', async ({ page }) => {
  await asDisconnected(page)
  await page.goto('/mails')
  await expect(page.getByText(t('settings.gmail.disconnectedPage', { email: 'alice@gmail.com' }))).toBeVisible()
  await expect(page.getByRole('link', { name: t('settings.gmail.reconnectInSettings') })).toHaveAttribute('href', '/settings/gmail')
  await page.goto('/archives')
  await expect(page.getByRole('heading', { level: 1, name: t('archives.title') })).toBeVisible()
  await expect(page.getByText('Édition du matin archivée')).toBeVisible()
})

test('enables 2FA with the QR code and a 6-digit code', async ({ page }) => {
  await page.goto('/settings/security')
  await page.getByRole('button', { name: t('settings.twoFactor.setup') }).click()
  await expect(page.getByRole('img', { name: t('settings.twoFactor.qr') })).toBeVisible()
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible()
  await page.getByLabel(t('settings.twoFactor.code')).fill('123456')
  const enable = page.waitForRequest(is('POST', '/api/auth/2fa/enable'))
  await page.getByRole('button', { name: t('settings.twoFactor.verify') }).click()
  expect((await enable).postDataJSON()).toEqual({ token: '123456' })
})

test('allows remote images in the reader preference (B10)', async ({ page }) => {
  await page.goto('/settings/account')
  const put = page.waitForRequest(is('PUT', '/api/notifications/preferences'))
  await page.getByRole('switch', { name: t('settings.remoteImages') }).click()
  expect((await put).postDataJSON()).toEqual({ remote_images: 'allow' })
})

test.describe('« Plus » (mobile)', () => {
  test.skip(({ isMobile }) => !isMobile, '« Plus » is the mobile entry point')

  test('lists the sections with a summary and logs out', async ({ page }) => {
    await page.goto('/overview')
    await page.getByRole('navigation', { name: t('shell.mainNav') }).getByRole('link', { name: t('shell.more') }).click()
    const settings = page.getByRole('region', { name: t('shell.settings') })
    await expect(settings.getByRole('link')).toHaveCount(6)
    await expect(settings.getByRole('link', { name: new RegExp(t('settings.summary.twoFactorOff')) })).toBeVisible()
    await expect(page.getByText(t('settings.signedInAs', { email: 'alice@example.com' }))).toBeVisible()

    await page.getByRole('button', { name: t('settings.logoutOfNid') }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})

test('imports several .eml files into the archives', async ({ page }) => {
  await page.goto('/settings/data')
  const upload = page.waitForRequest(is('POST', `/api/import/${ACCOUNT}/eml`))
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: t('settings.data.emlPick') }).click()
  await (await chooser).setFiles([
    { name: 'a.eml', mimeType: 'message/rfc822', buffer: Buffer.from('Subject: a\r\n\r\nx') },
    { name: 'b.eml', mimeType: 'message/rfc822', buffer: Buffer.from('Subject: b\r\n\r\ny') },
  ])
  const body = (await upload).postData() ?? ''
  expect(body.match(/filename="[ab]\.eml"/g)).toHaveLength(2)
  await expect(page.getByText('2 mails importés, 0 ignoré(s), 0 erreur(s)')).toBeVisible()
})

test('adding an IMAP account prefills its server from the address', async ({ page }) => {
  await page.route('**/api/auth/imap/autoconfig?*', (route) => route.fulfill({ json: { host: 'imap.gmx.net', port: 993, secure: true, source: 'ispdb' } }))
  await page.goto('/settings/gmail')
  await page.getByRole('button', { name: t('settings.imap.add') }).click()
  const form = page.getByRole('dialog', { name: t('settings.imap.addTitle') })
  await form.getByLabel(t('settings.imap.email')).fill('ana@gmx.fr')
  await form.getByLabel(t('settings.imap.email')).blur()
  await expect(form.getByLabel(t('settings.imap.host'))).toHaveValue('imap.gmx.net')
  await expect(form.getByText(t('settings.imap.found'))).toBeVisible()
})

test('« Dossiers et période » of an IMAP account', async ({ page }) => {
  const imap = { ...me.gmailAccounts[0], id: 'imap-1', email: 'ana@mail.fr', provider: 'imap', imap_host: 'imap.mail.fr', imap_port: 993, imap_secure: true, imap_user: 'ana' }
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...me, gmailAccounts: [imap] } }))
  await page.route('**/api/auth/imap/imap-1/folders', (route) => route.fulfill({ json: {
    folders: [
      { path: 'INBOX', name: 'INBOX', specialUse: null, syncedByDefault: true },
      { path: 'Archives/2024/Factures et relevés bancaires', name: 'Factures et relevés bancaires', specialUse: null, syncedByDefault: true },
      { path: 'Spam', name: 'Spam', specialUse: '\\Junk', syncedByDefault: false },
    ],
    chosen: null, since: null,
  } }))
  await page.route('**/api/auth/imap/imap-1/scope', (route) => route.fulfill({ json: route.request().postDataJSON() }))
  await page.goto('/settings/gmail')
  await page.getByRole('button', { name: t('settings.imap.scope.title') }).click()
  const dialog = page.getByRole('dialog', { name: t('settings.imap.scope.title') })
  await dialog.getByRole('radio', { name: t('settings.imap.scope.some') }).check()
  await dialog.getByRole('checkbox', { name: 'INBOX' }).click()
  await dialog.getByLabel(t('settings.imap.scope.since')).fill('2024-01-01')
  const save = page.waitForRequest(is('PUT', '/api/auth/imap/imap-1/scope'))
  await dialog.getByRole('button', { name: t('settings.imap.save') }).click()
  expect((await save).postDataJSON()).toEqual({ folders: ['Archives/2024/Factures et relevés bancaires'], since: '2024-01-01' })
  await expect(page.getByText(t('settings.imap.scope.saved'))).toBeVisible()
})
