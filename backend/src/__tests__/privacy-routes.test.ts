import Fastify from 'fastify'

const verify = vi.fn()
const status = vi.fn()
vi.mock('../privacy/encryption.service', () => ({ verifyEncryptionKey: (...a: unknown[]) => verify(...a), getEncryptionStatus: (...a: unknown[]) => status(...a) }))
const enqueue = vi.fn(async (..._a: unknown[]) => ({ id: 'job-dec' }))
vi.mock('../jobs/queue', () => ({ enqueueJob: (...a: unknown[]) => enqueue(...a) }))

import { privacyRoutes } from '../routes/privacy'

async function app() {
  const a = Fastify()
  a.decorate('authenticate', async (req: any) => { req.user = { sub: 'u1' } })
  a.decorate('requireAccountOwnership', async () => {})
  a.decorate('requireAdmin', async () => {})
  await a.register(privacyRoutes)
  return a
}

beforeEach(() => vi.clearAllMocks())

describe('privacyRoutes (way out of archive encryption)', () => {
  it('status: how many archives are still encrypted', async () => {
    status.mockResolvedValueOnce({ total: 10, encrypted: 4, unencrypted: 6, percentage: 40 })
    const a = await app()
    expect((await a.inject({ url: '/acc-1/encryption/status' })).json()).toEqual({ total: 10, encrypted: 4, unencrypted: 6, percentage: 40 })
    await a.close()
  })

  it('decrypt-all: checks the passphrase, then queues the job', async () => {
    const a = await app()
    verify.mockResolvedValueOnce(false)
    expect((await a.inject({ method: 'POST', url: '/acc-1/encryption/decrypt-all', payload: { passphrase: 'bad' } })).statusCode).toBe(403)
    expect(enqueue).not.toHaveBeenCalled()
    verify.mockResolvedValueOnce(true)
    const res = await a.inject({ method: 'POST', url: '/acc-1/encryption/decrypt-all', payload: { passphrase: 'good' } })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ jobId: 'job-dec' })
    expect(verify).toHaveBeenLastCalledWith('u1', 'good')
    expect(enqueue).toHaveBeenCalledWith('decrypt_archives', { accountId: 'acc-1', userId: 'u1', passphrase: 'good' })
    expect((await a.inject({ method: 'POST', url: '/acc-1/encryption/decrypt-all', payload: {} })).statusCode).not.toBe(202)
    await a.close()
  })
})
