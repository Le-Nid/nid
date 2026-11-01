// POST /api/import/:accountId/eml: real multipart parsing, each file through the archive import pipeline
const importSingleEml = vi.fn()
vi.mock('../archive/import.service', async (orig) => ({
  ...(await orig<typeof import('../archive/import.service')>()),
  importSingleEml: (...a: unknown[]) => importSingleEml(...a),
}))
vi.mock('../storage/storage.service', () => ({ getLocalStorage: () => ({}) }))
const invalidate = vi.fn()
vi.mock('../dashboard/cache.service', () => ({ invalidateDashboardCache: (id: string) => invalidate(id) }))

import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { importRoutes } from '../routes/import'
import { looksLikeEml } from '../archive/import.service'

const EML = (subject: string) => `Message-ID: <${subject}@x>\r\nSubject: ${subject}\r\nFrom: a@b.c\r\n\r\nbody`

async function upload(files: { name: string; content: string | Uint8Array<ArrayBuffer> }[]) {
  const app = Fastify()
  await app.register(multipart)
  app.decorate('authenticate', async (req: any) => { req.user = { sub: 'u1' } })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  await app.register(importRoutes)
  const form = new FormData()
  for (const f of files) form.append('files', new Blob([f.content]), f.name)
  const req = new Response(form)
  const res = await app.inject({
    method: 'POST', url: '/acc-1/eml',
    headers: { 'content-type': req.headers.get('content-type')! },
    payload: Buffer.from(await req.arrayBuffer()),
  })
  await app.close()
  return res
}

beforeEach(() => vi.clearAllMocks())

it('archives each .eml, counts duplicates and unreadable files, refreshes the dashboard', async () => {
  importSingleEml.mockResolvedValueOnce('imported').mockResolvedValueOnce('skipped').mockRejectedValueOnce(new Error('disk full'))
  const res = await upload([
    { name: 'a.eml', content: EML('a') }, { name: 'b.eml', content: EML('b') }, { name: 'c.eml', content: EML('c') },
    { name: 'photo.eml', content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
  ])
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ imported: 1, skipped: 1, errors: 2 })
  expect(importSingleEml).toHaveBeenCalledTimes(3)
  expect(importSingleEml.mock.calls[0][2]).toBe('acc-1')
  expect(importSingleEml.mock.calls[0][3].toString()).toBe(EML('a'))
  expect(invalidate).toHaveBeenCalledWith('acc-1')
})

it('400 without a file; nothing imported, no cache refresh', async () => {
  expect((await upload([])).statusCode).toBe(400)
  importSingleEml.mockResolvedValueOnce('skipped')
  expect((await upload([{ name: 'a.eml', content: EML('a') }])).json()).toEqual({ imported: 0, skipped: 1, errors: 0 })
  expect(invalidate).not.toHaveBeenCalled()
})

it.each([
  ['Return-Path: <a@b.c>\r\n', true], ['X-Mozilla-Status: 0001\n', true],
  ['From a@b.c Mon Jan 1 2024\n', false], ['﻿Subject: x', false], ['%PDF-1.7', false], ['', false],
])('looksLikeEml(%j) = %s', (head, ok) => {
  expect(looksLikeEml(Buffer.from(head))).toBe(ok)
})
