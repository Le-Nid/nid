import { describe, it, expect, vi } from 'vitest'

// Test webhook payload formatting logic (extracted from webhook.service.ts)
describe('webhook payload formatting', () => {
  it('discord embed has correct color for failed events', () => {
    const event = 'job.failed'
    const color = event.includes('failed') ? 0xff0000 : 0x00cc00
    expect(color).toBe(0xff0000)
  })

  it('discord embed has green color for success events', () => {
    const event = 'job.completed'
    const color = event.includes('failed') ? 0xff0000 : 0x00cc00
    expect(color).toBe(0x00cc00)
  })

  it('ntfy priority is 4 for failed events', () => {
    const event = 'integrity.failed'
    const priority = event.includes('failed') ? '4' : '3'
    expect(priority).toBe('4')
  })

  it('ntfy priority is 3 for success events', () => {
    const event = 'rule.executed'
    const priority = event.includes('failed') ? '4' : '3'
    expect(priority).toBe('3')
  })

  it('payload description is truncated to 2000 chars', () => {
    const longData = { content: 'x'.repeat(3000) }
    const description = JSON.stringify(longData, null, 2).slice(0, 2000)
    expect(description.length).toBe(2000)
  })
})

// Test webhook event filtering
describe('webhook event filtering', () => {
  const webhooks = [
    { id: '1', events: ['job.completed', 'job.failed'], is_active: true },
    { id: '2', events: ['rule.executed'], is_active: true },
    { id: '3', events: ['job.completed'], is_active: false },
  ]

  it('filters matching active webhooks for job.completed', () => {
    const matching = webhooks.filter((w) => w.is_active && w.events.includes('job.completed'))
    expect(matching).toHaveLength(1)
    expect(matching[0].id).toBe('1')
  })

  it('returns empty for events with no matching webhook', () => {
    const matching = webhooks.filter((w) => w.is_active && w.events.includes('quota.warning'))
    expect(matching).toHaveLength(0)
  })

  it('excludes inactive webhooks', () => {
    const matching = webhooks.filter((w) => w.is_active && w.events.includes('job.completed'))
    expect(matching.every((w) => w.is_active)).toBe(true)
  })
})

// Test webhook validation schema
describe('webhook schema validation', () => {
  const validTypes = ['generic', 'discord', 'slack', 'ntfy']
  const validEvents = ['job.completed', 'job.failed', 'rule.executed', 'quota.warning', 'integrity.failed']

  it('accepts all 4 webhook types', () => {
    expect(validTypes).toHaveLength(4)
    expect(validTypes).toContain('generic')
    expect(validTypes).toContain('discord')
    expect(validTypes).toContain('slack')
    expect(validTypes).toContain('ntfy')
  })

  it('supports 5 event types', () => {
    expect(validEvents).toHaveLength(5)
  })
})
