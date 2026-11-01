import { test, expect, t } from './mock-api'

// Pièces jointes (§7.6): the archive search also looks in the text of PDF/DOCX. Desktop and mobile projects.

test('a search found in a PDF shows its excerpt under the file name', async ({ page }) => {
  await page.goto('/attachments')
  await page.getByRole('searchbox', { name: t('attachments.searchLabel') }).fill('préavis')
  await page.getByRole('searchbox', { name: t('attachments.searchLabel') }).press('Enter')
  await expect(page).toHaveURL(/q=pr%C3%A9avis/)
  await expect(page.locator('mark').filter({ hasText: 'préavis' })).toBeVisible()
  await expect(page.getByText('contrat-signe.pdf')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})
