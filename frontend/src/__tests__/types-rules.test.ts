import { describe, it, expect } from 'vitest'
import {
  CONDITION_FIELD_LABELS,
  CONDITION_OPERATOR_LABELS,
  ACTION_LABELS,
  SCHEDULE_OPTIONS,
} from '../types/rules'

describe('types/rules constants', () => {
  it('CONDITION_FIELD_LABELS has all expected fields', () => {
    expect(CONDITION_FIELD_LABELS).toHaveProperty('from')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('to')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('subject')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('has_attachment')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('size_gt')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('size_lt')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('label')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('older_than')
    expect(CONDITION_FIELD_LABELS).toHaveProperty('newer_than')
    expect(Object.keys(CONDITION_FIELD_LABELS)).toHaveLength(9)
  })

  it('CONDITION_OPERATOR_LABELS has all operators', () => {
    expect(CONDITION_OPERATOR_LABELS).toHaveProperty('contains')
    expect(CONDITION_OPERATOR_LABELS).toHaveProperty('not_contains')
    expect(CONDITION_OPERATOR_LABELS).toHaveProperty('equals')
    expect(CONDITION_OPERATOR_LABELS).toHaveProperty('not_equals')
    expect(CONDITION_OPERATOR_LABELS).toHaveProperty('gt')
    expect(CONDITION_OPERATOR_LABELS).toHaveProperty('lt')
    expect(CONDITION_OPERATOR_LABELS).toHaveProperty('is_true')
  })

  it('ACTION_LABELS has all actions', () => {
    expect(ACTION_LABELS).toHaveProperty('trash')
    expect(ACTION_LABELS).toHaveProperty('delete')
    expect(ACTION_LABELS).toHaveProperty('label')
    expect(ACTION_LABELS).toHaveProperty('unlabel')
    expect(ACTION_LABELS).toHaveProperty('archive')
    expect(ACTION_LABELS).toHaveProperty('archive_nas')
    expect(ACTION_LABELS).toHaveProperty('mark_read')
    expect(ACTION_LABELS).toHaveProperty('mark_unread')
    expect(Object.keys(ACTION_LABELS)).toHaveLength(8)
  })

  it('SCHEDULE_OPTIONS includes null for manual', () => {
    expect(SCHEDULE_OPTIONS[0]).toEqual({ value: null, label: 'Manuel uniquement' })
    expect(SCHEDULE_OPTIONS).toHaveLength(5)
  })
})
