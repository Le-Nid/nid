import { describe, it, expect } from 'vitest'
import { buildGmailQuery } from '../rules/rules.service'
import type { RuleCondition } from '../rules/rules.types'

describe('buildGmailQuery', () => {
  it('génère from: pour contains', () => {
    const conds: RuleCondition[] = [
      { field: 'from', operator: 'contains', value: 'newsletter@' },
    ]
    expect(buildGmailQuery(conds)).toBe('from:(newsletter@)')
  })

  it('génère -from: pour not_contains', () => {
    const conds: RuleCondition[] = [
      { field: 'from', operator: 'not_contains', value: 'spam@' },
    ]
    expect(buildGmailQuery(conds)).toBe('-from:(spam@)')
  })

  it('génère has:attachment', () => {
    const conds: RuleCondition[] = [
      { field: 'has_attachment', operator: 'is_true', value: true },
    ]
    expect(buildGmailQuery(conds)).toBe('has:attachment')
  })

  it('génère -has:attachment pour false', () => {
    const conds: RuleCondition[] = [
      { field: 'has_attachment', operator: 'is_true', value: false },
    ]
    expect(buildGmailQuery(conds)).toBe('-has:attachment')
  })

  it('génère larger: pour size_gt', () => {
    const conds: RuleCondition[] = [
      { field: 'size_gt', operator: 'gt', value: 5000000 },
    ]
    expect(buildGmailQuery(conds)).toBe('larger:5000000')
  })

  it('combine plusieurs conditions', () => {
    const conds: RuleCondition[] = [
      { field: 'from',    operator: 'contains', value: 'promo' },
      { field: 'subject', operator: 'contains', value: 'offre' },
    ]
    expect(buildGmailQuery(conds)).toBe('from:(promo) subject:(offre)')
  })

  it('retourne chaîne vide pour tableau vide', () => {
    expect(buildGmailQuery([])).toBe('')
  })
})
