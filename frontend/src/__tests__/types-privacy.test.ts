import { describe, it, expect } from 'vitest'
import { PII_TYPE_LABELS, TRACKER_TYPE_LABELS } from '../types/privacy'

describe('types/privacy constants', () => {
  it('PII_TYPE_LABELS has all expected types', () => {
    expect(PII_TYPE_LABELS).toHaveProperty('credit_card')
    expect(PII_TYPE_LABELS).toHaveProperty('iban')
    expect(PII_TYPE_LABELS).toHaveProperty('french_ssn')
    expect(PII_TYPE_LABELS).toHaveProperty('password_plain')
    expect(PII_TYPE_LABELS).toHaveProperty('phone_fr')
    expect(Object.keys(PII_TYPE_LABELS)).toHaveLength(5)
  })

  it('PII_TYPE_LABELS has fr and en keys', () => {
    expect(PII_TYPE_LABELS.credit_card).toEqual({ fr: 'Carte bancaire', en: 'Credit card' })
    expect(PII_TYPE_LABELS.iban).toEqual({ fr: 'IBAN', en: 'IBAN' })
  })

  it('TRACKER_TYPE_LABELS has all expected types', () => {
    expect(TRACKER_TYPE_LABELS).toHaveProperty('pixel')
    expect(TRACKER_TYPE_LABELS).toHaveProperty('utm')
    expect(TRACKER_TYPE_LABELS).toHaveProperty('known_domain')
    expect(Object.keys(TRACKER_TYPE_LABELS)).toHaveLength(3)
  })

  it('TRACKER_TYPE_LABELS has fr and en keys', () => {
    expect(TRACKER_TYPE_LABELS.pixel).toEqual({ fr: 'Pixel espion', en: 'Tracking pixel' })
  })
})
