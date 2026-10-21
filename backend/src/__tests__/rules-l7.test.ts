import Fastify from 'fastify'
import { ZodError } from 'zod'

// ─── Recording Kysely mock: results are queued per terminal method ───
const calls: any[][] = []
const results = { executeTakeFirst: [] as any[], executeTakeFirstOrThrow: [] as any[] }
const chain: any = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'executeTakeFirst' || prop === 'executeTakeFirstOrThrow' || prop === 'execute') {
      return async () => {
        calls.push([prop])
        return prop === 'execute' ? [] : results[prop].shift()
      }
    }
    if (prop === 'then') return undefined
    return (...args: any[]) => {
      const resolved = args.map((a) => (typeof a === 'function' ? a(chain) : a))
      calls.push([prop, ...resolved])
      return chain
    }
  },
})
vi.mock('../db', () => ({ getDb: () => chain }))

const gmail = {
  listMessages: vi.fn(),
  batchGetMessages: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  listLabels: vi.fn(),
}
vi.mock('../gmail/gmail.service', () => ({
  listMessages: (...a: any[]) => gmail.listMessages(...a),
  batchGetMessages: (...a: any[]) => gmail.batchGetMessages(...a),
  createLabel: (...a: any[]) => gmail.createLabel(...a),
  updateLabel: (...a: any[]) => gmail.updateLabel(...a),
  listLabels: (...a: any[]) => gmail.listLabels(...a),
}))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../events/events.service', () => ({ publishUserEvents: vi.fn().mockResolvedValue(undefined) }))

import { rulesRoutes } from '../routes/rules'
import { gmailRoutes } from '../routes/gmail'
import { RULE_TEMPLATES } from '../rules/rule-templates'
import { buildGmailQuery } from '../rules/rules.service'

const ACC = 'acc-1'
const valuesOf = (method: string) => calls.find((c) => c[0] === method)?.[1]

async function buildApp(register: (app: any) => Promise<void>) {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => { request.user = { sub: 'user-1' } })
  app.decorate('requireAccountOwnership', async () => {})
  // same mapping as the global handler in plugins/index.ts
  app.setErrorHandler((err: any, _req, reply) => reply.code(err instanceof ZodError ? 400 : 500).send({ error: err.message }))
  await app.register(register)
  await app.ready()
  return app
}

beforeEach(() => {
  calls.length = 0
  results.executeTakeFirst = []
  results.executeTakeFirstOrThrow = []
  Object.values(gmail).forEach((f) => f.mockReset())
})

describe('RULE_TEMPLATES (B8)', () => {
  it('every template builds a Gmail query', () => {
    for (const t of RULE_TEMPLATES) expect(buildGmailQuery(t.dto.conditions)).toBeTruthy()
  })

  it('label templates carry a label name and a label action', () => {
    const label = RULE_TEMPLATES.filter((t) => t.category === 'label')
    expect(label.map((t) => t.id)).toEqual(['label-invoices', 'label-deliveries', 'label-bank', 'label-travel'])
    for (const t of label) {
      expect(t.label?.name).toBeTruthy()
      expect(t.dto.action).toEqual({ type: 'label' })
    }
  })

  it('expire templates trash after older_than', () => {
    const otp = RULE_TEMPLATES.find((t) => t.id === 'expire-otp')!
    expect(otp.category).toBe('expire')
    expect(buildGmailQuery(otp.dto.conditions)).toContain('older_than:1d')
    const promo = RULE_TEMPLATES.find((t) => t.id === 'expire-promotions')!
    expect(buildGmailQuery(promo.dto.conditions)).toBe('label:CATEGORY_PROMOTIONS older_than:7d')
    expect(promo.dto.action.type).toBe('trash')
  })
})

describe('POST /:accountId/preview (B6)', () => {
  const conditions = [{ field: 'from', operator: 'contains', value: 'shop.com' }]

  it('returns up to 5 samples and a size extrapolated from them', async () => {
    gmail.listMessages.mockResolvedValue({ messages: [{ id: 'm1' }, { id: 'm2' }], resultSizeEstimate: 143 })
    gmail.batchGetMessages.mockResolvedValue([
      { id: 'm1', from: 'a@shop.com', subject: 'Promo', date: 'Mon', sizeEstimate: 1000, snippet: 'x' },
      { id: 'm2', from: 'b@shop.com', subject: 'Soldes', date: 'Tue', sizeEstimate: 2001, snippet: 'y' },
    ])
    const app = await buildApp(rulesRoutes)
    const res = await app.inject({ method: 'POST', url: `/${ACC}/preview`, payload: { conditions } })
    expect(res.statusCode).toBe(200)
    expect(gmail.listMessages).toHaveBeenCalledWith(ACC, { query: 'from:(shop.com)', maxResults: 5 })
    expect(gmail.batchGetMessages).toHaveBeenCalledWith(ACC, ['m1', 'm2'])
    expect(res.json()).toEqual({
      query: 'from:(shop.com)',
      estimatedCount: 143,
      samples: [
        { id: 'm1', from: 'a@shop.com', subject: 'Promo', date: 'Mon' },
        { id: 'm2', from: 'b@shop.com', subject: 'Soldes', date: 'Tue' },
      ],
      sizeBytes: Math.round(1500.5 * 143),
    })
    await app.close()
  })

  it('no match: empty samples, zero size, no metadata fetch', async () => {
    gmail.listMessages.mockResolvedValue({ messages: [], resultSizeEstimate: 0 })
    const app = await buildApp(rulesRoutes)
    const res = await app.inject({ method: 'POST', url: `/${ACC}/preview`, payload: { conditions } })
    expect(res.json()).toEqual({ query: 'from:(shop.com)', estimatedCount: 0, samples: [], sizeBytes: 0 })
    expect(gmail.batchGetMessages).not.toHaveBeenCalled()
    await app.close()
  })

  it('rejects invalid conditions with 400', async () => {
    const app = await buildApp(rulesRoutes)
    const res = await app.inject({ method: 'POST', url: `/${ACC}/preview`, payload: { conditions: [] } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})

describe('POST /:accountId/from-template (B8)', () => {
  const post = async (templateId: unknown) => {
    const app = await buildApp(rulesRoutes)
    const res = await app.inject({ method: 'POST', url: `/${ACC}/from-template`, payload: { templateId } })
    await app.close()
    return res
  }

  it('label template reuses an existing Gmail label', async () => {
    results.executeTakeFirst.push(undefined, { id: 'Label_7' }) // no rule yet, label found
    results.executeTakeFirstOrThrow.push({ id: 'rule-1', template_id: 'label-invoices' })
    const res = await post('label-invoices')
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ id: 'rule-1', template_id: 'label-invoices' })
    expect(gmail.createLabel).not.toHaveBeenCalled()
    const row = valuesOf('values')
    expect(JSON.parse(row.action)).toEqual({ type: 'label', labelId: 'Label_7' })
    expect(row.template_id).toBe('label-invoices')
  })

  it('label template creates the Gmail label when missing and mirrors it', async () => {
    results.executeTakeFirst.push(undefined, undefined)
    results.executeTakeFirstOrThrow.push({ id: 'rule-2' })
    gmail.createLabel.mockResolvedValue({ id: 'Label_9', name: 'Livraisons' })
    const res = await post('label-deliveries')
    expect(res.statusCode).toBe(201)
    expect(gmail.createLabel).toHaveBeenCalledWith(ACC, 'Livraisons')
    const inserts = calls.filter((c) => c[0] === 'values')
    expect(inserts[0][1][0]).toMatchObject({ id: 'Label_9', name: 'Livraisons', type: 'user' })
    expect(JSON.parse(inserts[1][1].action)).toEqual({ type: 'label', labelId: 'Label_9' })
  })

  it('label created in Gmail since the last sync (409): resyncs and uses it', async () => {
    results.executeTakeFirst.push(undefined, undefined, { id: 'Label_5' }) // no rule, not mirrored, found after sync
    results.executeTakeFirstOrThrow.push({ id: 'rule-3' })
    gmail.createLabel.mockRejectedValue(Object.assign(new Error('Label name exists'), { code: 409 }))
    gmail.listLabels.mockResolvedValue([{ id: 'Label_5', name: 'Banque', type: 'user' }])
    const res = await post('label-bank')
    expect(res.statusCode).toBe(201)
    expect(gmail.listLabels).toHaveBeenCalledWith(ACC)
    const inserts = calls.filter((c) => c[0] === 'values')
    expect(JSON.parse(inserts.at(-1)![1].action)).toEqual({ type: 'label', labelId: 'Label_5' })
  })

  it('other Gmail errors on label creation propagate', async () => {
    results.executeTakeFirst.push(undefined, undefined)
    gmail.createLabel.mockRejectedValue(Object.assign(new Error('boom'), { code: 500 }))
    const res = await post('label-bank')
    expect(res.statusCode).toBe(500)
    expect(gmail.listLabels).not.toHaveBeenCalled()
  })

  it('is idempotent: returns the existing rule with 200', async () => {
    results.executeTakeFirst.push({ id: 'rule-1', template_id: 'label-bank' })
    const res = await post('label-bank')
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe('rule-1')
    expect(calls.some((c) => c[0] === 'insertInto')).toBe(false)
    expect(gmail.createLabel).not.toHaveBeenCalled()
  })

  it('expire template creates the rule without touching labels', async () => {
    results.executeTakeFirst.push(undefined)
    results.executeTakeFirstOrThrow.push({ id: 'rule-3' })
    const res = await post('expire-otp')
    expect(res.statusCode).toBe(201)
    expect(calls.filter((c) => c[0] === 'selectFrom').map((c) => c[1])).toEqual(['rules'])
    expect(JSON.parse(valuesOf('values').action)).toEqual({ type: 'trash' })
  })

  it('unknown template → 404, missing templateId → 400', async () => {
    expect((await post('nope')).statusCode).toBe(404)
    expect((await post(undefined)).statusCode).toBe(400)
  })
})

describe('labels routes', () => {
  it('PATCH renames and recolors through Gmail, then mirrors the label', async () => {
    const updated = { id: 'Label_1', name: 'Impôts', color: { backgroundColor: '#fb4c2f', textColor: '#ffffff' } }
    gmail.updateLabel.mockResolvedValue(updated)
    const app = await buildApp(gmailRoutes)
    const res = await app.inject({
      method: 'PATCH', url: `/${ACC}/labels/Label_1`,
      payload: { name: 'Impôts', color: { backgroundColor: '#fb4c2f', textColor: '#ffffff' } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(updated)
    expect(gmail.updateLabel).toHaveBeenCalledWith(ACC, 'Label_1', { name: 'Impôts', color: updated.color })
    expect(valuesOf('values')[0]).toMatchObject({ id: 'Label_1', color_bg: '#fb4c2f' })
    await app.close()
  })

  it('PATCH rejects an empty body and a non-hex color', async () => {
    const app = await buildApp(gmailRoutes)
    const empty = await app.inject({ method: 'PATCH', url: `/${ACC}/labels/Label_1`, payload: {} })
    expect(empty.statusCode).toBe(400)
    const bad = await app.inject({
      method: 'PATCH', url: `/${ACC}/labels/Label_1`, payload: { color: { backgroundColor: 'red', textColor: '#fff' } },
    })
    expect(bad.statusCode).toBe(400)
    expect(gmail.updateLabel).not.toHaveBeenCalled()
    await app.close()
  })

  it('POST labels validates the name', async () => {
    const app = await buildApp(gmailRoutes)
    for (const payload of [{}, { name: '' }, { name: 'x'.repeat(226) }]) {
      const res = await app.inject({ method: 'POST', url: `/${ACC}/labels`, payload })
      expect(res.statusCode).toBe(400)
    }
    expect(gmail.createLabel).not.toHaveBeenCalled()
    await app.close()
  })
})

describe('GET /:accountId/stats (L8)', () => {
  it('counts active rules and sums what completed run_rule jobs processed over 30 days', async () => {
    results.executeTakeFirst.push({ n: '3' }, { n: '1284' })
    const app = await buildApp(rulesRoutes)
    const res = await app.inject({ method: 'GET', url: `/${ACC}/stats` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ active: 3, processed30d: 1284 })
    const wheres = calls.filter((c) => c[0] === 'where').map((c) => c.slice(1))
    expect(wheres).toContainEqual(['type', '=', 'run_rule'])
    expect(wheres).toContainEqual(['status', '=', 'completed'])
    const since = wheres.find((w) => w[0] === 'completed_at')![2] as Date
    expect(Math.abs(Date.now() - since.getTime() - 30 * 86_400_000)).toBeLessThan(5_000)
    await app.close()
  })

  it('no rows → zeros', async () => {
    const app = await buildApp(rulesRoutes)
    const res = await app.inject({ method: 'GET', url: `/${ACC}/stats` })
    expect(res.json()).toEqual({ active: 0, processed30d: 0 })
    await app.close()
  })
})
