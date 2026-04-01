import { describe, it, expect } from 'vitest'
import { RULE_TEMPLATES } from '../rules/rule-templates'

describe('RULE_TEMPLATES', () => {
  it('has at least 9 templates', () => {
    expect(RULE_TEMPLATES.length).toBeGreaterThanOrEqual(9)
  })

  it('all templates have required fields', () => {
    for (const tmpl of RULE_TEMPLATES) {
      expect(tmpl.id).toBeTruthy()
      expect(tmpl.name).toBeTruthy()
      expect(tmpl.description).toBeTruthy()
      expect(['cleanup', 'archive', 'organize']).toContain(tmpl.category)
      expect(tmpl.dto).toBeDefined()
      expect(tmpl.dto.name).toBeTruthy()
      expect(tmpl.dto.conditions).toBeDefined()
      expect(Array.isArray(tmpl.dto.conditions)).toBe(true)
      expect(tmpl.dto.action).toBeDefined()
      expect(tmpl.dto.action.type).toBeTruthy()
    }
  })

  it('all template IDs are unique', () => {
    const ids = RULE_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has cleanup templates', () => {
    const cleanup = RULE_TEMPLATES.filter((t) => t.category === 'cleanup')
    expect(cleanup.length).toBeGreaterThanOrEqual(3)
  })

  it('has archive templates', () => {
    const archive = RULE_TEMPLATES.filter((t) => t.category === 'archive')
    expect(archive.length).toBeGreaterThanOrEqual(2)
  })

  it('has organize templates', () => {
    const organize = RULE_TEMPLATES.filter((t) => t.category === 'organize')
    expect(organize.length).toBeGreaterThanOrEqual(1)
  })

  it('cleanup-github-notifications has correct config', () => {
    const tmpl = RULE_TEMPLATES.find((t) => t.id === 'cleanup-github-notifications')
    expect(tmpl).toBeDefined()
    expect(tmpl!.dto.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'from', value: 'notifications@github.com' }),
      ]),
    )
    expect(tmpl!.dto.action.type).toBe('trash')
    expect(tmpl!.dto.schedule).toBe('weekly')
  })

  it('archive-old-mails uses archive_nas action', () => {
    const tmpl = RULE_TEMPLATES.find((t) => t.id === 'archive-old-mails')
    expect(tmpl).toBeDefined()
    expect(tmpl!.dto.action.type).toBe('archive_nas')
  })

  it('all conditions have valid fields', () => {
    const validFields = ['from', 'to', 'subject', 'has_attachment', 'size_gt', 'size_lt', 'label', 'older_than', 'newer_than']
    for (const tmpl of RULE_TEMPLATES) {
      for (const cond of tmpl.dto.conditions) {
        expect(validFields).toContain(cond.field)
      }
    }
  })

  it('all actions have valid types', () => {
    const validTypes = ['trash', 'delete', 'label', 'unlabel', 'archive', 'archive_nas', 'mark_read', 'mark_unread']
    for (const tmpl of RULE_TEMPLATES) {
      expect(validTypes).toContain(tmpl.dto.action.type)
    }
  })
})
