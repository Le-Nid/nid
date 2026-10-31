import Fastify from 'fastify'
import { ZodError } from 'zod'
import { simpleParser } from 'mailparser'

// ─── Recording Kysely mock: every builder call is logged as [method, ...args] ───
const calls: any[][] = []
const results = { execute: [] as any[], executeTakeFirst: [] as any[] }
const chain: any = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'execute' || prop === 'executeTakeFirst') {
      return async () => {
        calls.push([prop])
        return results[prop].shift()
      }
    }
    if (prop === 'then') return undefined
    return (...args: any[]) => {
      // onConflict / doUpdateSet callbacks: run them against the chain so their bodies execute
      const resolved = args.map((a) => (typeof a === 'function' ? a(chain) : a))
      calls.push([prop, ...resolved])
      return chain
    }
  },
})
vi.mock('../db', () => ({ getDb: () => chain }))

const mockSqlExecute = vi.fn()
vi.mock('kysely', async () => ({
  ...(await vi.importActual<any>('kysely')),
  sql: () => ({ execute: mockSqlExecute }),
}))

const mockListLabels = vi.fn()
vi.mock('../gmail/gmail.service', () => ({ listLabels: (...a: any[]) => mockListLabels(...a) }))

import {
  syncLabels, syncAllLabels, markLabelsDeleted, getLabelsWithCounts, resolveImportedLabelIds, upsertLabels,
} from '../labels/labels.service'
import { labelsRoutes } from '../routes/labels'
import { retentionRoutes } from '../routes/retention'
import { isKnownPolicyLabel } from '../archive/retention.service'
import { decodeMimeWords } from '../archive/import.service'

const ACC = '11111111-1111-4111-8111-111111111111'

const valuesOf = (method: string) => calls.find((c) => c[0] === method)?.[1]

beforeEach(() => {
  calls.length = 0
  results.execute = []
  results.executeTakeFirst = []
  mockListLabels.mockReset()
  mockSqlExecute.mockReset()
})

describe('labels.service — sync', () => {
  it('upserts labels with type classification and Gmail colors, then soft-deletes the missing ones', async () => {
    mockListLabels.mockResolvedValue([
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'CATEGORY_PROMOTIONS', name: 'CATEGORY_PROMOTIONS', type: 'system' },
      { id: 'Label_1', name: 'Factures', type: 'user', color: { backgroundColor: '#fb4c2f', textColor: '#ffffff' } },
      { id: 'Label_x' }, // no name: ignored
    ])

    expect(await syncLabels(ACC)).toEqual({ synced: 3 })

    const rows = valuesOf('values')
    expect(rows.map((r: any) => [r.id, r.type])).toEqual([
      ['INBOX', 'system'], ['CATEGORY_PROMOTIONS', 'category'], ['Label_1', 'user'],
    ])
    expect(rows[2]).toMatchObject({ account_id: ACC, color_bg: '#fb4c2f', color_text: '#ffffff', deleted_at: null })
    expect(rows[0]).toMatchObject({ color_bg: null, color_text: null, messages_total: null })
    // conflict on the composite key re-activates the label
    expect(calls.find((c) => c[0] === 'columns')?.[1]).toEqual(['account_id', 'id'])
    // soft delete: an UPDATE, never a DELETE, sparing imported rows and labels still in Gmail
    expect(calls.some((c) => c[0] === 'deleteFrom')).toBe(false)
    expect(calls).toContainEqual(['updateTable', 'gmail_labels'])
    expect(calls).toContainEqual(['where', 'type', '!=', 'imported'])
    expect(calls).toContainEqual(['where', 'id', 'not in', ['INBOX', 'CATEGORY_PROMOTIONS', 'Label_1']])
    expect(valuesOf('set').deleted_at).toBeInstanceOf(Date)
  })

  it('never marks everything deleted when Gmail returns no label', async () => {
    mockListLabels.mockResolvedValue([])
    expect(await syncLabels(ACC)).toEqual({ synced: 0 })
    expect(calls).toEqual([])
  })

  it('upsertLabels is a no-op without usable labels', async () => {
    await upsertLabels(ACC, [{ id: 'X' }])
    expect(calls).toEqual([])
  })

  it('markLabelsDeleted can target a single label', async () => {
    await markLabelsDeleted(ACC, { only: 'Label_9' })
    expect(calls).toContainEqual(['where', 'id', '=', 'Label_9'])
  })

  it('syncAllLabels keeps going when one account fails', async () => {
    results.execute = [[{ id: 'a' }, { id: 'b' }]]
    mockListLabels.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce([])
    await syncAllLabels()
    expect(mockListLabels).toHaveBeenCalledTimes(2)
    expect(mockListLabels).toHaveBeenLastCalledWith('b')
  })
})

describe('labels.service — read', () => {
  it('merges archived mail counts, deleted labels included', async () => {
    const deletedAt = new Date()
    results.execute = [[
      { id: 'Label_1', name: 'Factures', deleted_at: null },
      { id: 'Label_2', name: 'Old', deleted_at: deletedAt },
    ]]
    mockSqlExecute.mockResolvedValue({ rows: [{ label_id: 'Label_2', count: '4' }] })

    const labels = await getLabelsWithCounts(ACC)
    expect(labels).toEqual([
      { id: 'Label_1', name: 'Factures', deleted_at: null, archived_count: 0 },
      { id: 'Label_2', name: 'Old', deleted_at: deletedAt, archived_count: 4 },
    ])
  })
})

describe('labels.service — mbox import mapping', () => {
  it('maps Takeout names to Gmail ids and creates imported rows for unknown names', async () => {
    results.execute = [[
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'CATEGORY_PROMOTIONS', name: 'CATEGORY_PROMOTIONS', type: 'category' },
      { id: 'Label_1', name: 'Factures', type: 'user' },
    ]]
    const ids = await resolveImportedLabelIds(ACC, ['Inbox', 'Category Promotions', 'factures', 'Voyages'])
    expect(ids).toEqual(['INBOX', 'CATEGORY_PROMOTIONS', 'Label_1', 'imported:Voyages'])
    expect(valuesOf('values')).toEqual([expect.objectContaining({ id: 'imported:Voyages', name: 'Voyages', type: 'imported' })])
    expect(calls.some((c) => c[0] === 'doNothing')).toBe(true)
  })

  it('does not insert when every name is known, nor query without names', async () => {
    expect(await resolveImportedLabelIds(ACC, [])).toEqual([])
    expect(calls).toEqual([])
    results.execute = [[{ id: 'Label_1', name: 'Factures', type: 'user' }]]
    expect(await resolveImportedLabelIds(ACC, ['Factures'])).toEqual(['Label_1'])
    expect(calls.some((c) => c[0] === 'insertInto')).toBe(false)
  })

  it('decodes MIME-encoded X-Gmail-Labels values (mailparser leaves them raw)', async () => {
    const parsed = await simpleParser('X-Gmail-Labels: =?UTF-8?Q?Ouvert,Cat=C3=A9gorie_Promotions?=\r\nSubject: x\r\n\r\nbody')
    expect(decodeMimeWords(parsed.headers.get('x-gmail-labels') as string)).toBe('Ouvert,Catégorie Promotions')
    expect(decodeMimeWords('=?utf-8?B?RsOpdA==?= =?ISO-8859-1?Q?=E9t=E9?=,Inbox')).toBe('Fétété,Inbox')
    expect(decodeMimeWords('=?x-unknown?Q?a?=')).toBe('=?x-unknown?Q?a?=')
  })
})

// ─── Routes ───────────────────────────────────────────────────
async function buildApp(register: (app: any) => Promise<void>, owner = true) {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => { request.user = { sub: 'user-1' } })
  app.decorate('requireAccountOwnership', async (_req: any, reply: any) => {
    if (!owner) return reply.code(403).send({ error: 'Forbidden' })
  })
  app.decorate('requireAdmin', async () => {})
  // same mapping as the global handler in plugins/index.ts
  app.setErrorHandler((err: any, _req, reply) => reply.code(err instanceof ZodError ? 400 : 500).send({ error: err.message }))
  await app.register(register)
  await app.ready()
  return app
}

describe('labelsRoutes', () => {
  it('GET /:accountId returns the labels with counts', async () => {
    const app = await buildApp(labelsRoutes)
    results.execute = [[{ id: 'Label_1', name: 'Factures' }]]
    mockSqlExecute.mockResolvedValue({ rows: [] })
    const res = await app.inject({ method: 'GET', url: `/${ACC}` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([{ id: 'Label_1', name: 'Factures', archived_count: 0 }])
    await app.close()
  })

  it('rejects a non-uuid account id with 400 before touching the DB', async () => {
    const app = await buildApp(labelsRoutes)
    const res = await app.inject({ method: 'GET', url: '/not-a-uuid' })
    expect(res.statusCode).toBe(400)
    expect(calls).toEqual([])
    await app.close()
  })

  it('refuses an account the user does not own', async () => {
    const app = await buildApp(labelsRoutes, false)
    const res = await app.inject({ method: 'POST', url: `/${ACC}/sync` })
    expect(res.statusCode).toBe(403)
    expect(mockListLabels).not.toHaveBeenCalled()
    await app.close()
  })

  it('POST /:accountId/sync runs a sync', async () => {
    const app = await buildApp(labelsRoutes)
    mockListLabels.mockResolvedValue([{ id: 'INBOX', name: 'INBOX', type: 'system' }])
    const res = await app.inject({ method: 'POST', url: `/${ACC}/sync` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ synced: 1 })
    expect(mockListLabels).toHaveBeenCalledWith(ACC)
    await app.close()
  })
})

describe('retention label validation (B9)', () => {
  it('POST rejects a label unknown for the account', async () => {
    const app = await buildApp(retentionRoutes)
    results.executeTakeFirst = [undefined]
    const res = await app.inject({ method: 'POST', url: '/', payload: { name: 'n', maxAgeDays: 30, label: 'free text', gmailAccountId: ACC } })
    expect(res.statusCode).toBe(400)
    expect(calls.some((c) => c[0] === 'insertInto')).toBe(false)
    expect(calls).toContainEqual(['where', 'gmail_labels.account_id', '=', ACC])
    await app.close()
  })

  it('POST accepts a synced label id', async () => {
    const app = await buildApp(retentionRoutes)
    results.executeTakeFirst = [{ id: 'Label_1' }]
    const res = await app.inject({ method: 'POST', url: '/', payload: { name: 'n', maxAgeDays: 30, label: 'Label_1' } })
    expect(res.statusCode).not.toBe(400)
    expect(calls).toContainEqual(['insertInto', 'retention_policies'])
    await app.close()
  })

  it('PUT checks the label against the policy account; clearing the label skips the check', async () => {
    const app = await buildApp(retentionRoutes)
    results.executeTakeFirst = [{ account_id: ACC }, undefined]
    const bad = await app.inject({ method: 'PUT', url: '/p-1', payload: { label: 'nope' } })
    expect(bad.statusCode).toBe(400)
    expect(calls).toContainEqual(['where', 'gmail_labels.account_id', '=', ACC])

    calls.length = 0
    await app.inject({ method: 'PUT', url: '/p-1', payload: { label: '' } })
    expect(calls.some((c) => c[1] === 'gmail_labels')).toBe(false)
    await app.close()
  })

  it('isKnownPolicyLabel searches every account of the user when the policy has none', async () => {
    results.executeTakeFirst = [{ account_id: null }, { id: 'Label_1' }]
    expect(await isKnownPolicyLabel('user-1', 'Label_1', { policyId: 'p-1' })).toBe(true)
    expect(calls).toContainEqual(['where', 'mail_accounts.user_id', '=', 'user-1'])
    expect(calls.some((c) => c[1] === 'gmail_labels.account_id')).toBe(false)
  })
})
