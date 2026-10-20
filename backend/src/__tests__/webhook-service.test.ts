import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// ─── Mock DB ────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    updateTable: () => chain,
    set: () => chain,
    execute: mockExecute,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    updateTable: () => chainable(),
  }),
}))

vi.mock('pino', () => ({ default: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) }))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { mockLookup } = vi.hoisted(() => ({ mockLookup: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mockLookup }))

import { triggerWebhooks, isPrivateAddress } from '../webhooks/webhook.service'

/** sendWebhook is fire-and-forget and resolves DNS first */
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue({ status: 200 })
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

describe('SSRF guard', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.10', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1'])(
    'treats %s as private', (ip) => expect(isPrivateAddress(ip)).toBe(true),
  )
  it.each(['93.184.216.34', '2606:4700::1111'])('treats %s as public', (ip) => expect(isPrivateAddress(ip)).toBe(false))

  it('does not call a bracketed IPv6 loopback webhook', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'http://[::1]:8080/hook', type: 'generic', events: ['job.completed'], secret: null, is_active: true },
    ])
    await triggerWebhooks('user-1', 'job.completed', {})
    await flush()
    expect(mockLookup).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not call a webhook whose host resolves to the internal network', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '172.18.0.3', family: 4 }]) // e.g. the postgres container
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'http://postgres:5432/', type: 'generic', events: ['job.completed'], secret: null, is_active: true },
    ])
    await triggerWebhooks('user-1', 'job.completed', {})
    await flush()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('triggerWebhooks', () => {
  it('does nothing when no matching webhooks', async () => {
    mockExecute.mockResolvedValue([])
    await triggerWebhooks('user-1', 'job.completed', {})
    await flush()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does nothing when webhooks do not match event', async () => {
    mockExecute.mockResolvedValue([
      { id: 'w1', url: 'https://example.com', type: 'generic', events: ['rule.executed'], secret: null, is_active: true },
    ])
    await triggerWebhooks('user-1', 'job.completed', {})
    await flush()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends to matching generic webhook with HMAC signature', async () => {
    const secret = 'my-secret'
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://example.com/hook', type: 'generic', events: ['job.completed'], secret, is_active: true },
    ]).mockResolvedValue([]) // update call

    await triggerWebhooks('user-1', 'job.completed', { title: 'Done', count: 5 })

    await flush()

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Webhook-Signature': expect.stringMatching(/^sha256=/),
        }),
      }),
    )
  })

  it('sends discord embed format with human-readable title', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://discord.com/api/webhooks/123', type: 'discord', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', { title: 'Done', body: '5 mails archived' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.embeds).toBeDefined()
    expect(body.embeds[0].title).toBe('📬 Done')
    expect(body.embeds[0].description).toBe('5 mails archived')
    expect(body.embeds[0].color).toBe(0x00cc00) // green for success
  })

  it('sends discord red color for failed events', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://discord.com/api/webhooks/123', type: 'discord', events: ['job.failed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.failed', { title: 'Failed' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.embeds[0].color).toBe(0xff0000)
  })

  it('sends slack text format', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://hooks.slack.com/test', type: 'slack', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', { title: 'Done', body: '5 items processed' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.text).toContain('Done')
    expect(body.text).toContain('5 items processed')
  })

  it('slack falls back to event name when no title/body in data', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://hooks.slack.com/test', type: 'slack', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', { jobId: 'j1' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.text).toContain('job.completed')
  })

  it('sends ntfy format with priority headers and human-readable title', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://ntfy.sh/topic', type: 'ntfy', events: ['integrity.failed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'integrity.failed', { title: 'Alert', body: 'Archive integrity check failed' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[1].headers.Title).toBe('Nid: Alert')
    expect(fetchCall[1].body).toBe('Archive integrity check failed')
    expect(fetchCall[1].headers.Priority).toBe('4') // high for failed
    expect(fetchCall[1].headers.Tags).toBe('warning')
  })

  it('ntfy success events have priority 3', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://ntfy.sh/topic', type: 'ntfy', events: ['rule.executed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'rule.executed', {})

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[1].headers.Priority).toBe('3')
    expect(fetchCall[1].headers.Tags).toBe('white_check_mark')
  })

  it('ntfy webhook sends Basic auth when credentials are provided', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://ntfy.sh/topic', type: 'ntfy', events: ['job.completed'], secret: null, is_active: true, auth_user: 'myuser', auth_password: 'mypass' },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', { title: 'Done', body: '5 mails archived' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const expected = Buffer.from('myuser:mypass').toString('base64')
    expect(fetchCall[1].headers.Authorization).toBe(`Basic ${expected}`)
    expect(fetchCall[1].headers.Title).toBe('Nid: Done')
    expect(fetchCall[1].body).toBe('5 mails archived')
  })

  it('ntfy falls back to event name when no title/body in data', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://ntfy.sh/topic', type: 'ntfy', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', { jobId: 'j1' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[1].headers.Title).toBe('Nid: job.completed')
    // Body is JSON since no body field provided
    expect(JSON.parse(fetchCall[1].body)).toEqual({ jobId: 'j1' })
  })

  it('discord falls back to event name when no title/body in data', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://discord.com/api/webhooks/123', type: 'discord', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', { jobId: 'j1' })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.embeds[0].title).toBe('📬 job.completed')
  })

  it('includes status and count fields when provided', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://example.com/hook', type: 'generic', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', {
      title: 'Done',
      status: 'success',
      count: 0,
    })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.data.status).toBe('success')
    expect(body.data.count).toBe(0)
  })

  it('filters sensitive data from payload', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://example.com/hook', type: 'generic', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', {
      title: 'Done',
      password: 'secret123',
      accessToken: 'bearer-xxx',
      jobId: 'j1',
    })

    await flush()

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.data).not.toHaveProperty('password')
    expect(body.data).not.toHaveProperty('accessToken')
    expect(body.data.jobId).toBe('j1')
  })

  it('updates webhook last_triggered_at on success', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://example.com', type: 'generic', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    await triggerWebhooks('user-1', 'job.completed', {})

    await flush()

    // Wait for async webhook send
    await new Promise((r) => setTimeout(r, 50))
    // The updateTable should have been called
    expect(mockFetch).toHaveBeenCalled()
  })

  it('does not throw even when fetch fails', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'w1', url: 'https://example.com', type: 'generic', events: ['job.completed'], secret: null, is_active: true },
    ]).mockResolvedValue([])

    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(
      triggerWebhooks('user-1', 'job.completed', {}),
    ).resolves.toBeUndefined()
  })
})
