import Fastify from 'fastify'

const mockExecute = vi.fn()
const mockTakeFirst = vi.fn()
const mockTakeFirstOrThrow = vi.fn()
// Callable chain that runs the builder callbacks (select, subqueries) so their code is exercised
const handler: ProxyHandler<any> = {
  apply: () => chain,
  get: (_t, prop) => {
    if (prop === 'then') return undefined
    if (prop === 'execute') return mockExecute
    if (prop === 'executeTakeFirst') return mockTakeFirst
    if (prop === 'executeTakeFirstOrThrow') return mockTakeFirstOrThrow
    return new Proxy(function () {}, {
      ...handler,
      apply: (_f, _this, args: unknown[]) => {
        for (const arg of args) if (typeof arg === 'function') arg(chain)
        return chain
      },
    })
  },
}
const chain: any = new Proxy(function () {}, handler)
vi.mock('../db', () => ({ getDb: () => chain }))
vi.mock('../dashboard/cache.service', () => ({
  getCachedStats: vi.fn(), setCachedStats: vi.fn(), getCachedArchiveStats: vi.fn().mockResolvedValue(null), setCachedArchiveStats: vi.fn(),
}))
vi.mock('../gmail/gmail.service', () => ({ listMessages: vi.fn(), batchGetMessages: vi.fn(), getMailboxProfile: vi.fn(), getLabelStats: vi.fn() }))

import { dashboardRoutes } from '../routes/dashboard'

it('GET /:accountId/archive-stats adds 30 days (zeros filled), the heaviest mails/attachments and the dedup savings', async () => {
  const today = new Date().toISOString().slice(0, 10)
  mockTakeFirstOrThrow.mockResolvedValueOnce({ total_mails: '3', total_size: '300', last_archived_at: null })
  mockExecute
    .mockResolvedValueOnce([]) // bySender
    .mockResolvedValueOnce([{ day: today, count: '4' }]) // per day
    .mockResolvedValueOnce([{ id: 'm1', subject: 'Gros', sender: 'a@b.c', size_bytes: '9000', date: null }])
    .mockResolvedValueOnce([{ id: 'a1', filename: 'x.pdf', size_bytes: '8000', subject: 'Gros' }])
  mockTakeFirst.mockResolvedValueOnce({ total: '1500' }).mockResolvedValueOnce({ total: '1000' })

  const app = Fastify()
  app.decorate('authenticate', async (req: any) => { req.user = { sub: 'u1' } })
  app.decorate('requireAccountOwnership', async () => {})
  await app.register(dashboardRoutes)
  const body = (await app.inject({ url: '/acc-1/archive-stats' })).json()

  expect(body.daily).toHaveLength(30)
  expect(body.daily.at(-1)).toEqual({ day: today, count: 4 })
  expect(body.daily.slice(0, 29).every((d: { count: number }) => d.count === 0)).toBe(true)
  expect(body.biggestMails[0].subject).toBe('Gros')
  expect(body.biggestAttachments[0].filename).toBe('x.pdf')
  expect(body.dedup_saved_bytes).toBe(500)
})
