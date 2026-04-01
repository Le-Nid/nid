import { describe, it, expect, vi } from 'vitest'
import api from '../api/client'
import {
  dashboardApi, gmailApi, archiveApi, rulesApi, jobsApi,
  authApi, adminApi, unsubscribeApi, attachmentsApi, reportsApi,
  duplicatesApi, notificationsApi, auditApi, twoFactorApi,
  webhooksApi, integrityApi, configApi, privacyApi, analyticsApi,
  savedSearchesApi, unifiedApi, archiveThreadsApi,
} from '../api'

describe('API modules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockGet(data: any = {}) {
    vi.mocked(api.get).mockResolvedValueOnce({ data })
  }
  function mockPost(data: any = {}) {
    vi.mocked(api.post).mockResolvedValueOnce({ data })
  }
  function mockPut(data: any = {}) {
    vi.mocked(api.put).mockResolvedValueOnce({ data })
  }
  function mockPatch(data: any = {}) {
    vi.mocked(api.patch).mockResolvedValueOnce({ data })
  }
  function mockDelete(data: any = {}) {
    vi.mocked(api.delete).mockResolvedValueOnce({ data })
  }

  describe('dashboardApi', () => {
    it('getStats calls correct endpoint', async () => {
      mockGet({ total: 100 })
      const result = await dashboardApi.getStats('acc-1', 20)
      expect(api.get).toHaveBeenCalledWith('/api/dashboard/acc-1/stats', { params: { limit: 20 } })
      expect(result).toEqual({ total: 100 })
    })

    it('getArchiveStats calls correct endpoint', async () => {
      mockGet({ total_mails: 50 })
      await dashboardApi.getArchiveStats('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/dashboard/acc-1/archive-stats')
    })
  })

  describe('gmailApi', () => {
    it('listMessages', async () => {
      mockGet([])
      await gmailApi.listMessages('acc-1', { q: 'test' })
      expect(api.get).toHaveBeenCalledWith('/api/gmail/acc-1/messages', { params: { q: 'test' } })
    })

    it('getMessageFull', async () => {
      mockGet({ id: 'm1' })
      await gmailApi.getMessageFull('acc-1', 'm1')
      expect(api.get).toHaveBeenCalledWith('/api/gmail/acc-1/messages/m1/full')
    })

    it('batchGetMessages', async () => {
      mockPost([])
      await gmailApi.batchGetMessages('acc-1', ['m1', 'm2'])
      expect(api.post).toHaveBeenCalledWith('/api/gmail/acc-1/messages/batch', { ids: ['m1', 'm2'] })
    })

    it('listLabels', async () => {
      mockGet([])
      await gmailApi.listLabels('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/gmail/acc-1/labels')
    })

    it('createLabel', async () => {
      mockPost({ id: 'l1' })
      await gmailApi.createLabel('acc-1', 'Work')
      expect(api.post).toHaveBeenCalledWith('/api/gmail/acc-1/labels', { name: 'Work' })
    })

    it('bulkOperation', async () => {
      mockPost({ jobId: 'j1' })
      await gmailApi.bulkOperation('acc-1', 'trash', ['m1'], 'l1')
      expect(api.post).toHaveBeenCalledWith('/api/gmail/acc-1/messages/bulk', {
        action: 'trash', messageIds: ['m1'], labelId: 'l1',
      })
    })
  })

  describe('archiveApi', () => {
    it('listMails', async () => {
      mockGet([])
      await archiveApi.listMails('acc-1', { page: 1 })
      expect(api.get).toHaveBeenCalledWith('/api/archive/acc-1/mails', { params: { page: 1 } })
    })

    it('getMail', async () => {
      mockGet({ id: 'mail-1' })
      await archiveApi.getMail('acc-1', 'mail-1')
      expect(api.get).toHaveBeenCalledWith('/api/archive/acc-1/mails/mail-1')
    })

    it('triggerArchive', async () => {
      mockPost({ jobId: 'j1' })
      await archiveApi.triggerArchive('acc-1', { messageIds: ['m1'] })
      expect(api.post).toHaveBeenCalledWith('/api/archive/acc-1/archive', { messageIds: ['m1'] })
    })

    it('downloadAttachment returns correct URL', () => {
      const url = archiveApi.downloadAttachment('acc-1', 'att-1')
      expect(url).toBe('/api/archive/acc-1/attachments/att-1/download')
    })
  })

  describe('rulesApi', () => {
    it('list', async () => {
      mockGet([])
      await rulesApi.list('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/rules/acc-1')
    })

    it('get', async () => {
      mockGet({ id: 'r1' })
      await rulesApi.get('acc-1', 'r1')
      expect(api.get).toHaveBeenCalledWith('/api/rules/acc-1/r1')
    })

    it('create', async () => {
      mockPost({ id: 'r1' })
      await rulesApi.create('acc-1', { name: 'test' })
      expect(api.post).toHaveBeenCalledWith('/api/rules/acc-1', { name: 'test' })
    })

    it('update', async () => {
      mockPut({ id: 'r1' })
      await rulesApi.update('acc-1', 'r1', { name: 'updated' })
      expect(api.put).toHaveBeenCalledWith('/api/rules/acc-1/r1', { name: 'updated' })
    })

    it('toggle', async () => {
      mockPatch({})
      await rulesApi.toggle('acc-1', 'r1')
      expect(api.patch).toHaveBeenCalledWith('/api/rules/acc-1/r1/toggle')
    })

    it('delete', async () => {
      mockDelete({})
      await rulesApi.delete('acc-1', 'r1')
      expect(api.delete).toHaveBeenCalledWith('/api/rules/acc-1/r1')
    })

    it('run', async () => {
      mockPost({ jobId: 'j1' })
      await rulesApi.run('acc-1', 'r1')
      expect(api.post).toHaveBeenCalledWith('/api/rules/acc-1/r1/run')
    })

    it('preview', async () => {
      mockPost({ query: 'from:test', estimatedCount: 5 })
      await rulesApi.preview('acc-1', [{ field: 'from', operator: 'contains', value: 'test' }])
      expect(api.post).toHaveBeenCalledWith('/api/rules/acc-1/preview', {
        conditions: [{ field: 'from', operator: 'contains', value: 'test' }],
      })
    })

    it('getTemplates', async () => {
      mockGet([])
      await rulesApi.getTemplates()
      expect(api.get).toHaveBeenCalledWith('/api/rules/templates')
    })

    it('createFromTemplate', async () => {
      mockPost({ id: 'r1' })
      await rulesApi.createFromTemplate('acc-1', 'tmpl-1')
      expect(api.post).toHaveBeenCalledWith('/api/rules/acc-1/from-template', { templateId: 'tmpl-1' })
    })
  })

  describe('jobsApi', () => {
    it('list', async () => {
      mockGet([])
      await jobsApi.list({ status: 'active' })
      expect(api.get).toHaveBeenCalledWith('/api/jobs', { params: { status: 'active' } })
    })

    it('get', async () => {
      mockGet({ id: 'j1' })
      await jobsApi.get('j1')
      expect(api.get).toHaveBeenCalledWith('/api/jobs/j1')
    })

    it('cancel', async () => {
      mockDelete({})
      await jobsApi.cancel('j1')
      expect(api.delete).toHaveBeenCalledWith('/api/jobs/j1')
    })
  })

  describe('authApi', () => {
    it('getSocialAuthUrl', async () => {
      mockGet({ url: 'https://google.com/auth' })
      const result = await authApi.getSocialAuthUrl('google')
      expect(api.get).toHaveBeenCalledWith('/api/auth/social/google/url')
      expect(result).toEqual({ url: 'https://google.com/auth' })
    })
  })

  describe('adminApi', () => {
    it('getStats', async () => {
      mockGet({ users: 10 })
      await adminApi.getStats()
      expect(api.get).toHaveBeenCalledWith('/api/admin/stats')
    })

    it('listUsers', async () => {
      mockGet([])
      await adminApi.listUsers({ page: 1 })
      expect(api.get).toHaveBeenCalledWith('/api/admin/users', { params: { page: 1 } })
    })

    it('getUser', async () => {
      mockGet({ id: 'u1' })
      await adminApi.getUser('u1')
      expect(api.get).toHaveBeenCalledWith('/api/admin/users/u1')
    })

    it('updateUser', async () => {
      mockPatch({})
      await adminApi.updateUser('u1', { role: 'admin' })
      expect(api.patch).toHaveBeenCalledWith('/api/admin/users/u1', { role: 'admin' })
    })

    it('listJobs', async () => {
      mockGet([])
      await adminApi.listJobs({})
      expect(api.get).toHaveBeenCalledWith('/api/admin/jobs', { params: {} })
    })
  })

  describe('unsubscribeApi', () => {
    it('scanNewsletters', async () => {
      mockGet([])
      await unsubscribeApi.scanNewsletters('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/unsubscribe/acc-1/newsletters')
    })

    it('scanAsync', async () => {
      mockPost({ jobId: 'j1' })
      await unsubscribeApi.scanAsync('acc-1')
      expect(api.post).toHaveBeenCalledWith('/api/unsubscribe/acc-1/scan')
    })

    it('getMessageIds', async () => {
      mockGet([])
      await unsubscribeApi.getMessageIds('acc-1', 'news@test.com')
      expect(api.get).toHaveBeenCalledWith('/api/unsubscribe/acc-1/newsletters/news%40test.com/messages')
    })

    it('deleteSender', async () => {
      mockPost({})
      await unsubscribeApi.deleteSender('acc-1', 'news@test.com', true)
      expect(api.post).toHaveBeenCalledWith('/api/unsubscribe/acc-1/newsletters/news%40test.com/delete', { permanent: true })
    })
  })

  describe('attachmentsApi', () => {
    it('listArchived', async () => {
      mockGet([])
      await attachmentsApi.listArchived('acc-1', { page: 1 })
      expect(api.get).toHaveBeenCalledWith('/api/attachments/acc-1/archived', { params: { page: 1 } })
    })

    it('listLive', async () => {
      mockGet([])
      await attachmentsApi.listLive('acc-1', {})
      expect(api.get).toHaveBeenCalledWith('/api/attachments/acc-1/live', { params: {} })
    })

    it('getDedupStats', async () => {
      mockGet({ savedBytes: 0 })
      await attachmentsApi.getDedupStats()
      expect(api.get).toHaveBeenCalledWith('/api/attachments/dedup-stats')
    })

    it('runDedupBackfill', async () => {
      mockPost({ processed: 0 })
      await attachmentsApi.runDedupBackfill()
      expect(api.post).toHaveBeenCalledWith('/api/attachments/dedup-backfill')
    })
  })

  describe('reportsApi', () => {
    it('getWeekly', async () => {
      mockGet({ stats: {} })
      await reportsApi.getWeekly()
      expect(api.get).toHaveBeenCalledWith('/api/reports/weekly')
    })
  })

  describe('duplicatesApi', () => {
    it('detectArchived', async () => {
      mockGet({ groups: [] })
      await duplicatesApi.detectArchived('acc-1', {})
      expect(api.get).toHaveBeenCalledWith('/api/duplicates/acc-1/archived', { params: {} })
    })

    it('deleteArchived', async () => {
      mockPost({ deleted: 3 })
      await duplicatesApi.deleteArchived('acc-1', ['m1', 'm2'])
      expect(api.post).toHaveBeenCalledWith('/api/duplicates/acc-1/archived/delete', { mailIds: ['m1', 'm2'] })
    })
  })

  describe('notificationsApi', () => {
    it('list', async () => {
      mockGet({ notifications: [], unreadCount: 0 })
      await notificationsApi.list({ limit: 10 })
      expect(api.get).toHaveBeenCalledWith('/api/notifications', { params: { limit: 10 } })
    })

    it('markRead', async () => {
      mockPatch({})
      await notificationsApi.markRead('n1')
      expect(api.patch).toHaveBeenCalledWith('/api/notifications/n1/read')
    })

    it('markAllRead', async () => {
      mockPatch({})
      await notificationsApi.markAllRead()
      expect(api.patch).toHaveBeenCalledWith('/api/notifications/read-all')
    })

    it('remove', async () => {
      mockDelete({})
      await notificationsApi.remove('n1')
      expect(api.delete).toHaveBeenCalledWith('/api/notifications/n1')
    })

    it('removeAllRead', async () => {
      mockDelete({})
      await notificationsApi.removeAllRead()
      expect(api.delete).toHaveBeenCalledWith('/api/notifications')
    })

    it('getPreferences', async () => {
      mockGet({ weekly_report: true })
      await notificationsApi.getPreferences()
      expect(api.get).toHaveBeenCalledWith('/api/notifications/preferences')
    })

    it('updatePreferences', async () => {
      mockPut({})
      await notificationsApi.updatePreferences({ weekly_report: false })
      expect(api.put).toHaveBeenCalledWith('/api/notifications/preferences', { weekly_report: false })
    })
  })

  describe('auditApi', () => {
    it('list', async () => {
      mockGet([])
      await auditApi.list({ page: 1 })
      expect(api.get).toHaveBeenCalledWith('/api/audit', { params: { page: 1 } })
    })
  })

  describe('twoFactorApi', () => {
    it('setup', async () => {
      mockPost({ qrCode: 'data:image/png;base64,...' })
      await twoFactorApi.setup()
      expect(api.post).toHaveBeenCalledWith('/api/auth/2fa/setup')
    })

    it('enable', async () => {
      mockPost({})
      await twoFactorApi.enable('123456')
      expect(api.post).toHaveBeenCalledWith('/api/auth/2fa/enable', { token: '123456' })
    })

    it('disable', async () => {
      mockPost({})
      await twoFactorApi.disable('123456')
      expect(api.post).toHaveBeenCalledWith('/api/auth/2fa/disable', { token: '123456' })
    })
  })

  describe('webhooksApi', () => {
    it('list', async () => {
      mockGet([])
      await webhooksApi.list()
      expect(api.get).toHaveBeenCalledWith('/api/webhooks')
    })

    it('create', async () => {
      mockPost({ id: 'w1' })
      await webhooksApi.create({ name: 'test', url: 'https://example.com', type: 'http', events: ['job.completed'] })
      expect(api.post).toHaveBeenCalledWith('/api/webhooks', {
        name: 'test', url: 'https://example.com', type: 'http', events: ['job.completed'],
      })
    })

    it('update', async () => {
      mockPut({})
      await webhooksApi.update('w1', { name: 'updated' })
      expect(api.put).toHaveBeenCalledWith('/api/webhooks/w1', { name: 'updated' })
    })

    it('toggle', async () => {
      mockPatch({})
      await webhooksApi.toggle('w1')
      expect(api.patch).toHaveBeenCalledWith('/api/webhooks/w1/toggle')
    })

    it('remove', async () => {
      mockDelete({})
      await webhooksApi.remove('w1')
      expect(api.delete).toHaveBeenCalledWith('/api/webhooks/w1')
    })

    it('test', async () => {
      mockPost({})
      await webhooksApi.test('w1')
      expect(api.post).toHaveBeenCalledWith('/api/webhooks/w1/test')
    })
  })

  describe('integrityApi', () => {
    it('check without accountId', async () => {
      mockGet({ ok: true })
      await integrityApi.check()
      expect(api.get).toHaveBeenCalledWith('/api/integrity/check', { params: {} })
    })

    it('check with accountId', async () => {
      mockGet({ ok: true })
      await integrityApi.check('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/integrity/check', { params: { accountId: 'acc-1' } })
    })
  })

  describe('configApi', () => {
    it('exportConfig', async () => {
      mockGet({ rules: [] })
      await configApi.exportConfig()
      expect(api.get).toHaveBeenCalledWith('/api/config/export')
    })

    it('importConfig', async () => {
      mockPost({ imported: 5 })
      await configApi.importConfig({ rules: [] })
      expect(api.post).toHaveBeenCalledWith('/api/config/import', { rules: [] })
    })
  })

  describe('privacyApi', () => {
    it('getTrackingStats', async () => {
      mockGet({})
      await privacyApi.getTrackingStats('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/privacy/acc-1/tracking/stats')
    })

    it('listTrackedMessages', async () => {
      mockGet([])
      await privacyApi.listTrackedMessages('acc-1', { page: 1 })
      expect(api.get).toHaveBeenCalledWith('/api/privacy/acc-1/tracking', { params: { page: 1 } })
    })

    it('scanTracking', async () => {
      mockPost({})
      await privacyApi.scanTracking('acc-1', 100)
      expect(api.post).toHaveBeenCalledWith('/api/privacy/acc-1/tracking/scan', { maxMessages: 100 })
    })

    it('getPiiStats', async () => {
      mockGet({})
      await privacyApi.getPiiStats('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/privacy/acc-1/pii/stats')
    })

    it('listPiiFindings', async () => {
      mockGet([])
      await privacyApi.listPiiFindings('acc-1', {})
      expect(api.get).toHaveBeenCalledWith('/api/privacy/acc-1/pii', { params: {} })
    })

    it('scanPii', async () => {
      mockPost({})
      await privacyApi.scanPii('acc-1')
      expect(api.post).toHaveBeenCalledWith('/api/privacy/acc-1/pii/scan')
    })

    it('getEncryptionStatus', async () => {
      mockGet({})
      await privacyApi.getEncryptionStatus('acc-1')
      expect(api.get).toHaveBeenCalledWith('/api/privacy/acc-1/encryption/status')
    })

    it('setupEncryption', async () => {
      mockPost({})
      await privacyApi.setupEncryption('pass123')
      expect(api.post).toHaveBeenCalledWith('/api/privacy/encryption/setup', { passphrase: 'pass123' })
    })

    it('verifyEncryption', async () => {
      mockPost({})
      await privacyApi.verifyEncryption('pass123')
      expect(api.post).toHaveBeenCalledWith('/api/privacy/encryption/verify', { passphrase: 'pass123' })
    })

    it('encryptArchives', async () => {
      mockPost({})
      await privacyApi.encryptArchives('acc-1', 'pass123')
      expect(api.post).toHaveBeenCalledWith('/api/privacy/acc-1/encryption/encrypt', { passphrase: 'pass123' })
    })

    it('decryptMail', async () => {
      mockPost({})
      await privacyApi.decryptMail('acc-1', 'mail-1', 'pass123')
      expect(api.post).toHaveBeenCalledWith('/api/privacy/acc-1/encryption/decrypt-mail', { mailId: 'mail-1', passphrase: 'pass123' })
    })
  })

  describe('analyticsApi', () => {
    it('getHeatmap', async () => {
      mockGet({})
      await analyticsApi.getHeatmap('acc-1', false)
      expect(api.get).toHaveBeenCalledWith('/api/analytics/acc-1/heatmap', { params: {} })
    })

    it('getHeatmap with refresh', async () => {
      mockGet({})
      await analyticsApi.getHeatmap('acc-1', true)
      expect(api.get).toHaveBeenCalledWith('/api/analytics/acc-1/heatmap', { params: { refresh: '1' } })
    })

    it('getSenderScores', async () => {
      mockGet({})
      await analyticsApi.getSenderScores('acc-1', false)
      expect(api.get).toHaveBeenCalledWith('/api/analytics/acc-1/sender-scores', { params: {} })
    })

    it('getCleanupSuggestions', async () => {
      mockGet([])
      await analyticsApi.getCleanupSuggestions('acc-1', false)
      expect(api.get).toHaveBeenCalledWith('/api/analytics/acc-1/cleanup-suggestions', { params: {} })
    })

    it('dismissSuggestion', async () => {
      mockPatch({})
      await analyticsApi.dismissSuggestion('s1')
      expect(api.patch).toHaveBeenCalledWith('/api/analytics/suggestions/s1/dismiss')
    })

    it('getInboxZero', async () => {
      mockGet({})
      await analyticsApi.getInboxZero('acc-1', false)
      expect(api.get).toHaveBeenCalledWith('/api/analytics/acc-1/inbox-zero', { params: {} })
    })

    it('recordSnapshot', async () => {
      mockPost({})
      await analyticsApi.recordSnapshot('acc-1')
      expect(api.post).toHaveBeenCalledWith('/api/analytics/acc-1/inbox-zero/snapshot')
    })
  })

  describe('savedSearchesApi', () => {
    it('list', async () => {
      mockGet([])
      await savedSearchesApi.list()
      expect(api.get).toHaveBeenCalledWith('/api/saved-searches')
    })

    it('create', async () => {
      mockPost({ id: 's1' })
      await savedSearchesApi.create({ name: 'test', query: 'from:foo' })
      expect(api.post).toHaveBeenCalledWith('/api/saved-searches', { name: 'test', query: 'from:foo' })
    })

    it('update', async () => {
      mockPut({})
      await savedSearchesApi.update('s1', { name: 'updated' })
      expect(api.put).toHaveBeenCalledWith('/api/saved-searches/s1', { name: 'updated' })
    })

    it('remove', async () => {
      mockDelete({})
      await savedSearchesApi.remove('s1')
      expect(api.delete).toHaveBeenCalledWith('/api/saved-searches/s1')
    })

    it('reorder', async () => {
      mockPut({})
      await savedSearchesApi.reorder(['s2', 's1'])
      expect(api.put).toHaveBeenCalledWith('/api/saved-searches/reorder', { ids: ['s2', 's1'] })
    })
  })

  describe('unifiedApi', () => {
    it('listMessages', async () => {
      mockGet([])
      await unifiedApi.listMessages({ q: 'test' })
      expect(api.get).toHaveBeenCalledWith('/api/unified/messages', { params: { q: 'test' } })
    })
  })

  describe('archiveThreadsApi', () => {
    it('listThreads', async () => {
      mockGet([])
      await archiveThreadsApi.listThreads('acc-1', { page: 1 })
      expect(api.get).toHaveBeenCalledWith('/api/archive/acc-1/threads', { params: { page: 1 } })
    })

    it('getThread', async () => {
      mockGet({ id: 't1' })
      await archiveThreadsApi.getThread('acc-1', 't1')
      expect(api.get).toHaveBeenCalledWith('/api/archive/acc-1/threads/t1')
    })
  })
})
