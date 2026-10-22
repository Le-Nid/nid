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
const jobs = load('jobs')
const attachments = load('attachments')
const admin = load('admin')
const settings = load('settings')

const archive = load('archive')

/** Archive search contract (B2): `label` filters, `q` adds a `highlight` whose only markup is <mark>. */
function archiveSearch(req: Request) {
  const params = new URL(req.url()).searchParams
  const q = params.get('q')?.toLowerCase()
  const label = params.get('label')
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const mails = archive.mails
    .filter((m: { label_ids: string[] }) => !label || m.label_ids.includes(label))
    .filter((m: { subject: string; snippet: string }) => !q || `${m.subject} ${m.snippet}`.toLowerCase().includes(q))
    .map((m: { snippet: string }) => (q ? { ...m, highlight: escape(m.snippet).replace(new RegExp(q, 'i'), (w) => `<mark>${w}</mark>`) } : m))
  return { mails, total: mails.length, page: 1, limit: 50, tookMs: 120 }
}

type Handler = unknown | ((req: Request) => unknown)

// First match wins: "METHOD regex on pathname" → JSON body (or a function of the request).
const ROUTES: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/auth\/me$/, me],
  ['GET', /^\/api\/auth\/config$/, { allowRegistration: true, socialProviders: [] }],
  ['GET', /^\/api\/notifications\/preferences$/, settings.preferences],
  ['PUT', /^\/api\/notifications\/preferences$/, { ok: true }],
  ['PATCH', /^\/api\/auth\/gmail\/[^/]+$/, (req: Request) => ({ id: ACCOUNT, ...req.postDataJSON() })],
  ['DELETE', /^\/api\/auth\/gmail\/[^/]+$/, {}],
  ['POST', /^\/api\/auth\/2fa\/setup$/, settings.twoFactorSetup],
  ['POST', /^\/api\/auth\/2fa\/(enable|disable)$/, { ok: true }],
  ['POST', /^\/api\/labels\/[^/]+\/sync$/, { synced: 12 }],
  ['POST', /^\/api\/webhooks$/, (req: Request) => ({ id: 'w-new', is_active: true, last_status: null, ...req.postDataJSON() })],
  ['PATCH', /^\/api\/webhooks\/[^/]+\/toggle$/, { ok: true }],
  ['POST', /^\/api\/webhooks\/[^/]+\/test$/, { ok: true }],
  ['DELETE', /^\/api\/webhooks\/[^/]+$/, {}],
  ['GET', /^\/api\/config\/export$/, { rules: [], webhooks: [] }],
  ['GET', /^\/api\/notifications$/, { notifications: [], unreadCount: 0 }],
  ['GET', /^\/api\/jobs$/, (req: Request) => {
    const params = new URL(req.url()).searchParams
    const status = params.get('status')?.split(',')
    const list = jobs.filter((j: { status: string }) => !status || status.includes(j.status))
    if (params.get('withCounts') !== 'true') return list
    const counts: Record<string, number> = {}
    for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1
    return { jobs: list, counts }
  }],
  ['POST', /^\/api\/jobs\/[^/]+\/retry$/, { jobId: 'job-retry', retryOf: 'j3' }],
  ['GET', /^\/api\/dashboard\/[^/]+\/stats$/, dashboard.stats],
  ['GET', /^\/api\/dashboard\/[^/]+\/archive-stats$/, dashboard.archiveStats],
  ['GET', /^\/api\/gmail\/[^/]+\/labels$/, gmail.labels],
  ['GET', /^\/api\/labels\/[^/]+$/, gmail.synced],
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
  ['GET', /^\/api\/archive\/[^/]+\/mails$/, archiveSearch],
  ['GET', /^\/api\/archive\/[^/]+\/mails\/[^/]+$/, (req: Request) => {
    const mail = archive.mails.find((m: { id: string }) => req.url().endsWith(m.id)) ?? archive.mails[0]
    return { ...mail, recipient: 'ana@gmail.com', html: '', text: mail.snippet, attachments: [] }
  }],
  ['GET', /^\/api\/archive\/[^/]+\/threads\/[^/]+$/, []],
  ['POST', /^\/api\/archive\/[^/]+\/mails\/trash$/, (req: Request) => ({ trashed: req.postDataJSON().mailIds.length })],
  ['POST', /^\/api\/archive\/[^/]+\/mails\/restore$/, (req: Request) => ({ restored: req.postDataJSON().mailIds.length })],
  ['GET', /^\/api\/archive\/[^/]+\/trash$/, { mails: archive.trash, total: archive.trash.length, page: 1, limit: 100, retentionDays: 30 }],
  ['DELETE', /^\/api\/archive\/[^/]+\/trash$/, { deleted: archive.trash.length }],
  ['POST', /^\/api\/import\/[^/]+\/export-mbox$/, {}],
  ['GET', /^\/api\/shares$/, archive.shares],
  ['POST', /^\/api\/shares$/, (req: Request) => ({ ...archive.shares[0], id: 'share-new', token: 'bbbb', archived_mail_id: req.postDataJSON().archivedMailId })],
  ['DELETE', /^\/api\/shares\/[^/]+$/, {}],
  ['GET', /^\/api\/retention$/, archive.retention],
  ['POST', /^\/api\/retention\/run$/, { policiesRun: 1, totalDeleted: 3 }],
  ['POST', /^\/api\/retention$/, (req: Request) => ({ id: 'pol-new', ...req.postDataJSON() })],
  ['PUT', /^\/api\/retention\/[^/]+$/, {}],
  ['DELETE', /^\/api\/retention\/[^/]+$/, {}],
  ['GET', /^\/api\/analytics\/[^/]+\/cleanup-suggestions$/, dashboard.suggestions],
  ['PATCH', /^\/api\/analytics\/suggestions\/[^/]+\/dismiss$/, { ok: true }],
  ['GET', /^\/api\/rules\/templates$/, load('templates')],
  ['GET', /^\/api\/rules\/[^/]+\/stats$/, dashboard.ruleStats],
  ['GET', /^\/api\/rules\/[^/]+$/, load('rules')],
  ['GET', /^\/api\/unsubscribe\/[^/]+\/newsletters$/, load('newsletters')],
  ['GET', /^\/api\/attachments\/dedup-stats$/, attachments.dedupStats],
  ['GET', /^\/api\/attachments\/[^/]+\/archived$/, attachments.archived],
  ['GET', /^\/api\/attachments\/[^/]+\/live$/, attachments.live],
  ['POST', /^\/api\/unsubscribe\/[^/]+\/scan$/, { jobId: 'job-scan' }],
  ['POST', /^\/api\/unsubscribe\/[^/]+\/newsletters\/[^/]+\/delete$/, { jobId: 'job-sender', runAt: '2026-10-21T08:00:10Z', count: 12 }],
  ['POST', /^\/api\/rules\/[^/]+\/preview$/, {
    query: 'from:(digest@news.test)', estimatedCount: 12, sizeBytes: 3 * 1024 * 1024,
    samples: [{ id: 'm1', from: 'Weekly Digest <digest@news.test>', subject: 'Les nouvelles de la semaine', date: '2026-10-20T08:00:00Z' }],
  }],
  ['POST', /^\/api\/rules\/[^/]+\/from-template$/, (req: Request) => ({ id: 'rule-tpl', template_id: req.postDataJSON().templateId })],
  ['POST', /^\/api\/rules\/[^/]+\/[^/]+\/run$/, { jobId: 'job-rule', runAt: '2026-10-21T08:00:10Z' }],
  ['PATCH', /^\/api\/rules\/[^/]+\/[^/]+\/toggle$/, { ok: true }],
  ['PUT', /^\/api\/rules\/[^/]+\/[^/]+$/, (req: Request) => ({ id: 'r1', ...req.postDataJSON() })],
  ['DELETE', /^\/api\/rules\/[^/]+\/[^/]+$/, {}],
  ['POST', /^\/api\/rules\/[^/]+$/, (req: Request) => ({ id: 'rule-new', ...req.postDataJSON() })],
  ['POST', /^\/api\/gmail\/[^/]+\/labels$/, { id: 'Label_new', name: 'Nouveau', type: 'user' }],
  ['PATCH', /^\/api\/gmail\/[^/]+\/labels\/[^/]+$/, (req: Request) => ({ id: 'Label_1', ...req.postDataJSON() })],
  ['DELETE', /^\/api\/gmail\/[^/]+\/labels\/[^/]+$/, {}],
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
