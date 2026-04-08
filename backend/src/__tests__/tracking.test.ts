import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pino', () => ({ default: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
vi.mock('../db', () => ({ getDb: vi.fn() }))
vi.mock('../gmail/gmail.service', () => ({ getGmailClient: vi.fn() }))
vi.mock('../gmail/gmail-throttle', () => ({ gmailRetry: (fn: any) => fn() }))
vi.mock('../gmail/quota.service', () => ({ trackApiCall: vi.fn().mockResolvedValue(undefined) }))

import { detectTrackingPixels } from '../privacy/tracking.service'

beforeEach(() => vi.clearAllMocks())

describe('detectTrackingPixels', () => {
  it('detects 1x1 pixel images', () => {
    const html = '<img src="https://example.com/pixel.gif" width="1" height="1" />'
    const result = detectTrackingPixels(html)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'pixel', url: 'https://example.com/pixel.gif' }),
      ]),
    )
  })

  it('detects hidden tracking images', () => {
    const html = '<img src="https://example.com/track.png" style="display:none" />'
    const result = detectTrackingPixels(html)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'pixel' }),
      ]),
    )
  })

  it('detects visibility:hidden tracking images', () => {
    const html = '<img src="https://example.com/t.png" style="visibility:hidden" />'
    const result = detectTrackingPixels(html)
    expect(result.length).toBeGreaterThan(0)
  })

  it('detects known tracking domains (mailchimp)', () => {
    const html = '<img src="https://open.mailchimp.com/track/abc123" />'
    const result = detectTrackingPixels(html)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'known_domain', domain: 'open.mailchimp.com' }),
      ]),
    )
  })

  it('detects sendgrid tracking domain', () => {
    const html = '<img src="https://u12345.ct.sendgrid.net/open.gif" />'
    const result = detectTrackingPixels(html)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'known_domain' }),
      ]),
    )
  })

  it('detects hubspot tracking domain', () => {
    const html = '<img src="https://track.hubspot.com/pixel.gif" />'
    const result = detectTrackingPixels(html)
    expect(result.length).toBeGreaterThan(0)
  })

  it('detects UTM parameters in links', () => {
    const html = '<a href="https://example.com/page?utm_source=newsletter&utm_medium=email">Click</a>'
    const result = detectTrackingPixels(html)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'utm',
          domain: 'example.com',
          params: expect.arrayContaining(['utm_source', 'utm_medium']),
        }),
      ]),
    )
  })

  it('detects utm_campaign param', () => {
    const html = '<a href="https://shop.com/sale?utm_campaign=summer">Buy</a>'
    const result = detectTrackingPixels(html)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'utm', params: ['utm_campaign'] }),
      ]),
    )
  })

  it('returns empty for clean HTML', () => {
    const html = '<html><body><h1>Hello</h1><p>Regular email</p><img src="https://example.com/logo.png" width="200" height="100" /></body></html>'
    const result = detectTrackingPixels(html)
    expect(result).toEqual([])
  })

  it('deduplicates same pixel URL', () => {
    const html = `
      <img src="https://example.com/track.gif" width="1" height="1" />
      <img src="https://example.com/track.gif" width="1" height="1" />
    `
    const result = detectTrackingPixels(html)
    const pixels = result.filter((r) => r.url === 'https://example.com/track.gif')
    expect(pixels).toHaveLength(1)
  })

  it('deduplicates UTM by hostname', () => {
    const html = `
      <a href="https://shop.com/a?utm_source=email">A</a>
      <a href="https://shop.com/b?utm_source=email">B</a>
    `
    const result = detectTrackingPixels(html)
    const utms = result.filter((r) => r.type === 'utm')
    expect(utms).toHaveLength(1)
  })

  it('detects style-based 1px dimensions', () => {
    const html = '<img src="https://example.com/p.gif" style="width:1px;height:1px" />'
    const result = detectTrackingPixels(html)
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles invalid URLs in href gracefully', () => {
    const html = '<a href="not-a-url?utm_source=test">Link</a>'
    const result = detectTrackingPixels(html)
    // Should not crash
    expect(Array.isArray(result)).toBe(true)
  })

  it('detects multiple tracker types in one email', () => {
    const html = `
      <img src="https://open.mailchimp.com/track.gif" />
      <img src="https://example.com/pixel.gif" width="1" height="1" />
      <a href="https://example.com/?utm_source=email&utm_medium=newsletter">Click</a>
    `
    const result = detectTrackingPixels(html)
    const types = result.map((r) => r.type)
    expect(types).toContain('known_domain')
    expect(types).toContain('pixel')
    expect(types).toContain('utm')
  })

  it('detects google-analytics.com domain', () => {
    const html = '<img src="https://www.google-analytics.com/collect?v=1" />'
    const result = detectTrackingPixels(html)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'known_domain' }),
      ]),
    )
  })

  it('detects facebook tracking pixel domain', () => {
    const html = '<img src="https://www.facebook.com/tr?id=123" />'
    const result = detectTrackingPixels(html)
    expect(result.length).toBeGreaterThan(0)
  })
})
