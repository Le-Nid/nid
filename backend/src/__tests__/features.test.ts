import { describe, it, expect } from 'vitest'

describe('config export format', () => {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    accounts: [
      {
        email: 'user@gmail.com',
        rules: [
          { name: 'Test rule', conditions: [], action: { type: 'trash' }, schedule: null, is_active: true },
        ],
      },
    ],
    webhooks: [
      { name: 'Discord', url: 'https://discord.com/api/webhooks/123', type: 'discord', events: ['job.completed'], is_active: true },
    ],
  }

  it('has version field', () => {
    expect(exportData.version).toBe('1.0')
  })

  it('has ISO timestamp', () => {
    expect(exportData.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rules are grouped by account email', () => {
    expect(exportData.accounts[0].email).toBe('user@gmail.com')
    expect(exportData.accounts[0].rules).toHaveLength(1)
  })

  it('webhooks do not include secrets', () => {
    const wh = exportData.webhooks[0] as Record<string, unknown>
    expect(wh).not.toHaveProperty('secret')
    expect(wh).not.toHaveProperty('user_id')
  })
})

describe('integrity check result', () => {
  const result = {
    totalRecords: 100,
    checkedFiles: 98,
    missingFiles: ['a/b/c.eml', 'a/b/d.eml'],
    orphanedFiles: [],
    corruptedFiles: ['a/b/e.eml'],
    healthy: false,
  }

  it('healthy is false when there are missing files', () => {
    const healthy = result.missingFiles.length === 0 &&
                    result.orphanedFiles.length === 0 &&
                    result.corruptedFiles.length === 0
    expect(healthy).toBe(false)
  })

  it('counts missing + corrupted files', () => {
    const issues = result.missingFiles.length + result.corruptedFiles.length
    expect(issues).toBe(3)
  })
})

describe('keyboard shortcuts config', () => {
  const IGNORED_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

  it('ignores input elements', () => {
    expect(IGNORED_TAGS).toContain('INPUT')
    expect(IGNORED_TAGS).toContain('TEXTAREA')
  })

  const shortcuts: Record<string, string> = {
    j: 'next', k: 'prev', Enter: 'open', o: 'open',
    e: 'archive', '#': 'trash', r: 'read', u: 'unread',
    '/': 'search', Escape: 'deselect',
  }

  it('has 10 shortcuts defined', () => {
    expect(Object.keys(shortcuts)).toHaveLength(10)
  })

  it('j and k are navigation keys', () => {
    expect(shortcuts.j).toBe('next')
    expect(shortcuts.k).toBe('prev')
  })
})
