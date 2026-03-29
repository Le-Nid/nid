import { describe, it, expect } from 'vitest'
import { formatBytes, formatSender, formatEmail } from '../utils/format'

describe('formatBytes', () => {
  it('retourne 0 B pour 0', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formate en Ko', () => {
    expect(formatBytes(1024)).toBe('1 Ko')
  })

  it('formate en Mo', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 Mo')
  })

  it('formate en Go', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 Go')
  })

  it('arrondit à 1 décimale', () => {
    expect(formatBytes(1536)).toBe('1.5 Ko')
  })
})

describe('formatSender', () => {
  it('extrait le nom affiché', () => {
    expect(formatSender('John Doe <john@example.com>')).toBe('John Doe')
  })

  it('retourne l\'email si pas de nom', () => {
    expect(formatSender('john@example.com')).toBe('john@example.com')
  })

  it('trim les espaces', () => {
    expect(formatSender('  Jane  <jane@example.com>')).toBe('Jane')
  })
})

describe('formatEmail', () => {
  it('extrait l\'adresse email', () => {
    expect(formatEmail('John Doe <john@example.com>')).toBe('john@example.com')
  })

  it('retourne la valeur brute si pas de <>',  () => {
    expect(formatEmail('john@example.com')).toBe('john@example.com')
  })
})
