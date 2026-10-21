import AxeBuilder from '@axe-core/playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect, t } from './mock-api'

// Ratchet: E2E_A11Y_STRICT=1 fails a page only when it has MORE violations than its baseline.
// Refresh the baseline after fixing issues: E2E_A11Y_UPDATE=1 npx playwright test a11y --workers=1
// (one worker, because every test rewrites the same file).
const BASELINE_FILE = new URL('./a11y-baseline.json', import.meta.url)
const readBaseline = (): Record<string, Record<string, number>> => JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))

const PAGES: [name: string, path: string, ready: string][] = [
  ['login', '/login', 'login.submit'],
  ['overview', '/overview', 'dashboard.title'],
  ['mails', '/mails', 'mails.title'],
  ['archives', '/archives', 'archive.title'],
  ['rules', '/rules', 'rules.title'],
  ['labels', '/rules?tab=labels', 'rules.title'],
  ['activity', '/activity', 'jobs.title'],
  ['settings', '/settings/account', 'settings.title'],
  ['cleanup', '/cleanup', 'cleanup.title'],
  ['attachments', '/attachments', 'attachments.title'],
  ['admin', '/admin', 'admin.title'],
]

for (const [name, path, ready] of PAGES) {
  test(`a11y ${name}`, async ({ page }, testInfo) => {
    if (name === 'login') {
      await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: 'Unauthorized' } }))
    }
    await page.goto(path)
    await expect(page.getByRole(name === 'login' ? 'button' : 'heading', { name: t(ready) })).toBeVisible()
    await page.waitForLoadState('networkidle')

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    // Count failing nodes, not rules: fixing one element of a rule must lower the number.
    const count = violations.reduce((n, v) => n + v.nodes.length, 0)
    const project = testInfo.project.name
    const summary = violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join(', ')
    console.log(`[a11y] ${project}/${name}: ${count} nodes — ${summary || 'none'}`)
    await testInfo.attach(`a11y-${name}.json`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })

    if (process.env.E2E_A11Y_UPDATE) {
      const baseline = readBaseline()
      baseline[project] = { ...baseline[project], [name]: count }
      writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + '\n')
    } else if (process.env.E2E_A11Y_STRICT) {
      expect(count, `a11y violations on ${name} (baseline in e2e/a11y-baseline.json)`)
        .toBeLessThanOrEqual(readBaseline()[project]?.[name] ?? 0)
    }
  })
}
