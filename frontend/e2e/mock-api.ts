import { test as base, expect, type Request } from '@playwright/test'
import { readFileSync } from 'node:fs'

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
const fr = JSON.parse(readFileSync(new URL('../src/i18n/locales/fr.json', import.meta.url), 'utf8'))

/** Same strings the app renders (locale fr-FR is forced in playwright.config.ts). */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const value = key.split('.').reduce((o: any, k) => o?.[k], fr)
  if (typeof value !== 'string') throw new Error(`Missing i18n key: ${key}`)
  return value.replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars[v]))
}

export const ACCOUNT = 'acc-1'
const me = load('me')
const gmail = load('gmail')
const dashboard = load('dashboard')
const attachments = load('attachments')
const admin = load('admin')
const settings = load('settings')

type Handler = unknown | ((req: Request) => unknown)

// First match wins: "METHOD regex on pathname" → JSON body (or a function of the request).
const ROUTES: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/auth\/me$/, me],
  ['GET', /^\/api\/auth\/config$/, { allowRegistration: true, socialProviders: [] }],
  ['GET', /^\/api\/notifications\/preferences$/, {}],
  ['GET', /^\/api\/notifications$/, { notifications: [], unreadCount: 0 }],
  ['GET', /^\/api\/jobs$/, load('jobs')],
  ['GET', /^\/api\/dashboard\/[^/]+\/stats$/, dashboard.stats],
  ['GET', /^\/api\/dashboard\/[^/]+\/archive-stats$/, dashboard.archiveStats],
  ['GET', /^\/api\/gmail\/[^/]+\/labels$/, gmail.labels],
  ['GET', /^\/api\/gmail\/[^/]+\/messages$/, {
    messages: gmail.mails.map((m: { id: string; threadId: string }) => ({ id: m.id, threadId: m.threadId })),
    resultSizeEstimate: gmail.mails.length,
  }],
  ['POST', /^\/api\/gmail\/[^/]+\/messages\/batch$/, (req: Request) => {
    const { ids } = req.postDataJSON()
    return gmail.mails.filter((m: { id: string }) => ids.includes(m.id))
  }],
  ['POST', /^\/api\/gmail\/[^/]+\/messages\/bulk$/, { jobId: 'job-bulk' }],
  ['GET', /^\/api\/gmail\/[^/]+\/messages\/[^/]+\/full$/, gmail.full],
  ['POST', /^\/api\/archive\/[^/]+\/archive$/, { jobId: 'job-nas' }],
  ['DELETE', /^\/api\/jobs\/[^/]+$/, { ok: true }],
  ['GET', /^\/api\/archive\/config\/trash$/, { retentionDays: 30, purgeEnabled: true }],
  ['GET', /^\/api\/archive\/[^/]+\/mails$/, load('archive')],
  ['GET', /^\/api\/rules\/templates$/, []],
  ['GET', /^\/api\/rules\/[^/]+$/, load('rules')],
  ['GET', /^\/api\/unsubscribe\/[^/]+\/newsletters$/, load('newsletters')],
  ['GET', /^\/api\/attachments\/dedup-stats$/, attachments.dedupStats],
  ['GET', /^\/api\/attachments\/[^/]+\/archived$/, attachments.archived],
  ['GET', /^\/api\/admin\/stats$/, admin.stats],
  ['GET', /^\/api\/admin\/users$/, admin.users],
  ['GET', /^\/api\/admin\/jobs$/, admin.jobs],
  ['GET', /^\/api\/audit$/, settings.audit],
  ['GET', /^\/api\/webhooks$/, settings.webhooks],
  ['GET', /^\/api\/saved-searches$/, []],
]

export type ApiMock = { requests: Request[] }

/**
 * Every test gets the whole API mocked at the network level (no backend).
 * Unknown endpoints answer 404 so pages fall back to their empty state; a test can
 * override any endpoint with its own page.route(), which takes precedence.
 */
export const test = base.extend<{ api: ApiMock }>({
  api: [async ({ page }, use) => {
    const requests: Request[] = []
    // Pathname predicate, not '**/api/**': that glob also swallows Vite's own /src/api/*.ts modules.
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const req = route.request()
      requests.push(req)
      const { pathname } = new URL(req.url())
      // Live counters SSE (B3): 204 tells EventSource to stop without reconnecting, so no badge and no retry noise
      if (pathname === '/api/events') return route.fulfill({ status: 204 })
      const hit = ROUTES.find(([method, re]) => method === req.method() && re.test(pathname))
      if (!hit) {
        console.warn(`[e2e] unmocked ${req.method()} ${pathname}`)
        return route.fulfill({ status: 404, json: { error: 'not mocked' } })
      }
      const body = typeof hit[2] === 'function' ? (hit[2] as (r: Request) => unknown)(req) : hit[2]
      return route.fulfill({ json: body })
    })
    await use({ requests })
  }, { auto: true }],
})

export { expect }
