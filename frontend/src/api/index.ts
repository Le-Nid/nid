import api from './client'

// ─── Dashboard ────────────────────────────────────────────
export const dashboardApi = {
  getStats: (accountId: string, limit = 20) =>
    api.get(`/api/dashboard/${accountId}/stats`, { params: { limit } }).then((r) => r.data),

  getArchiveStats: (accountId: string) =>
    api.get(`/api/dashboard/${accountId}/archive-stats`).then((r) => r.data),
}

// ─── Gmail ────────────────────────────────────────────────
export const gmailApi = {
  listMessages: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/gmail/${accountId}/messages`, { params }).then((r) => r.data),

  getMessageFull: (accountId: string, messageId: string) =>
    api.get(`/api/gmail/${accountId}/messages/${messageId}/full`).then((r) => r.data),

  batchGetMessages: (accountId: string, ids: string[]) =>
    api.post(`/api/gmail/${accountId}/messages/batch`, { ids }).then((r) => r.data),

  listLabels: (accountId: string) =>
    api.get(`/api/gmail/${accountId}/labels`).then((r) => r.data),

  createLabel: (accountId: string, name: string) =>
    api.post(`/api/gmail/${accountId}/labels`, { name }).then((r) => r.data),

  bulkOperation: (
    accountId: string,
    action: string,
    messageIds: string[],
    labelId?: string
  ) =>
    api
      .post(`/api/gmail/${accountId}/messages/bulk`, { action, messageIds, labelId })
      .then((r) => r.data),
}

// ─── Archive ──────────────────────────────────────────────
export const archiveApi = {
  listMails: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/archive/${accountId}/mails`, { params }).then((r) => r.data),

  getMail: (accountId: string, mailId: string) =>
    api.get(`/api/archive/${accountId}/mails/${mailId}`).then((r) => r.data),

  triggerArchive: (accountId: string, body: Record<string, any>) =>
    api.post(`/api/archive/${accountId}/archive`, body).then((r) => r.data),

  downloadAttachment: (accountId: string, attachmentId: string) =>
    `${api.defaults.baseURL}/api/archive/${accountId}/attachments/${attachmentId}/download`,
}

// ─── Rules ────────────────────────────────────────────────
export const rulesApi = {
  list: (accountId: string) =>
    api.get(`/api/rules/${accountId}`).then((r) => r.data),

  get: (accountId: string, ruleId: string) =>
    api.get(`/api/rules/${accountId}/${ruleId}`).then((r) => r.data),

  create: (accountId: string, dto: any) =>
    api.post(`/api/rules/${accountId}`, dto).then((r) => r.data),

  update: (accountId: string, ruleId: string, dto: any) =>
    api.put(`/api/rules/${accountId}/${ruleId}`, dto).then((r) => r.data),

  toggle: (accountId: string, ruleId: string) =>
    api.patch(`/api/rules/${accountId}/${ruleId}/toggle`).then((r) => r.data),

  delete: (accountId: string, ruleId: string) =>
    api.delete(`/api/rules/${accountId}/${ruleId}`).then((r) => r.data),

  run: (accountId: string, ruleId: string) =>
    api.post(`/api/rules/${accountId}/${ruleId}/run`).then((r) => r.data),

  preview: (accountId: string, conditions: any[]) =>
    api.post(`/api/rules/${accountId}/preview`, { conditions }).then((r) => r.data),

  getTemplates: () =>
    api.get('/api/rules/templates').then((r) => r.data),

  createFromTemplate: (accountId: string, templateId: string) =>
    api.post(`/api/rules/${accountId}/from-template`, { templateId }).then((r) => r.data),
}

// ─── Jobs ─────────────────────────────────────────────────
export const jobsApi = {
  list: (params: Record<string, any> = {}) =>
    api.get('/api/jobs', { params }).then((r) => r.data),

  get: (jobId: string) =>
    api.get(`/api/jobs/${jobId}`).then((r) => r.data),

  cancel: (jobId: string) =>
    api.delete(`/api/jobs/${jobId}`).then((r) => r.data),
}

// ─── Auth (Social providers — Google, Microsoft, Discord, etc.) ──
export const authApi = {
  getSocialAuthUrl: (provider: string) =>
    api.get(`/api/auth/social/${provider}/url`).then((r) => r.data),
}

// ─── Admin ────────────────────────────────────────────────
export const adminApi = {
  getStats: () =>
    api.get('/api/admin/stats').then((r) => r.data),

  listUsers: (params: Record<string, any> = {}) =>
    api.get('/api/admin/users', { params }).then((r) => r.data),

  getUser: (userId: string) =>
    api.get(`/api/admin/users/${userId}`).then((r) => r.data),

  updateUser: (userId: string, dto: Record<string, any>) =>
    api.patch(`/api/admin/users/${userId}`, dto).then((r) => r.data),

  listJobs: (params: Record<string, any> = {}) =>
    api.get('/api/admin/jobs', { params }).then((r) => r.data),
}

// ─── Unsubscribe ──────────────────────────────────────────
export const unsubscribeApi = {
  scanNewsletters: (accountId: string) =>
    api.get(`/api/unsubscribe/${accountId}/newsletters`).then((r) => r.data),

  scanAsync: (accountId: string) =>
    api.post(`/api/unsubscribe/${accountId}/scan`).then((r) => r.data),

  getMessageIds: (accountId: string, senderEmail: string) =>
    api.get(`/api/unsubscribe/${accountId}/newsletters/${encodeURIComponent(senderEmail)}/messages`).then((r) => r.data),

  deleteSender: (accountId: string, senderEmail: string, permanent = false) =>
    api.post(`/api/unsubscribe/${accountId}/newsletters/${encodeURIComponent(senderEmail)}/delete`, { permanent }).then((r) => r.data),
}

// ─── Attachments ──────────────────────────────────────────
export const attachmentsApi = {
  listArchived: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/attachments/${accountId}/archived`, { params }).then((r) => r.data),

  listLive: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/attachments/${accountId}/live`, { params }).then((r) => r.data),

  downloadArchivedUrl: (accountId: string, attachmentId: string, inline = false) =>
    `/api/attachments/${accountId}/archived/${attachmentId}/download${inline ? '?inline=1' : ''}`,

  downloadLiveUrl: (accountId: string, messageId: string, filename: string, inline = false) =>
    `/api/attachments/${accountId}/live/${messageId}/download?filename=${encodeURIComponent(filename)}${inline ? '&inline=1' : ''}`,

  getDedupStats: () =>
    api.get('/api/attachments/dedup-stats').then((r) => r.data),

  runDedupBackfill: () =>
    api.post('/api/attachments/dedup-backfill').then((r) => r.data),
}

// ─── Reports ──────────────────────────────────────────────
export const reportsApi = {
  getWeekly: () =>
    api.get('/api/reports/weekly').then((r) => r.data),
}

// ─── Duplicates ───────────────────────────────────────────
export const duplicatesApi = {
  detectArchived: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/duplicates/${accountId}/archived`, { params }).then((r) => r.data),

  deleteArchived: (accountId: string, mailIds: string[]) =>
    api.post(`/api/duplicates/${accountId}/archived/delete`, { mailIds }).then((r) => r.data),
}

// ─── Notifications ────────────────────────────────────────
export const notificationsApi = {
  list: (params: Record<string, any> = {}) =>
    api.get('/api/notifications', { params }).then((r) => r.data),

  markRead: (notificationId: string) =>
    api.patch(`/api/notifications/${notificationId}/read`).then((r) => r.data),

  markAllRead: () =>
    api.patch('/api/notifications/read-all').then((r) => r.data),

  remove: (notificationId: string) =>
    api.delete(`/api/notifications/${notificationId}`).then((r) => r.data),

  removeAllRead: () =>
    api.delete('/api/notifications').then((r) => r.data),

  getPreferences: () =>
    api.get('/api/notifications/preferences').then((r) => r.data),

  updatePreferences: (prefs: Record<string, boolean>) =>
    api.put('/api/notifications/preferences', prefs).then((r) => r.data),
}

// ─── Audit ────────────────────────────────────────────────
export const auditApi = {
  list: (params: Record<string, any> = {}) =>
    api.get('/api/audit', { params }).then((r) => r.data),
}

// ─── 2FA / TOTP ──────────────────────────────────────────
export const twoFactorApi = {
  setup: () =>
    api.post('/api/auth/2fa/setup').then((r) => r.data),

  enable: (token: string) =>
    api.post('/api/auth/2fa/enable', { token }).then((r) => r.data),

  disable: (token: string) =>
    api.post('/api/auth/2fa/disable', { token }).then((r) => r.data),
}

// ─── Webhooks ─────────────────────────────────────────────
export const webhooksApi = {
  list: () =>
    api.get('/api/webhooks').then((r) => r.data),

  create: (data: { name: string; url: string; type: string; events: string[] }) =>
    api.post('/api/webhooks', data).then((r) => r.data),

  update: (id: string, data: Record<string, any>) =>
    api.put(`/api/webhooks/${id}`, data).then((r) => r.data),

  toggle: (id: string) =>
    api.patch(`/api/webhooks/${id}/toggle`).then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/api/webhooks/${id}`).then((r) => r.data),

  test: (id: string) =>
    api.post(`/api/webhooks/${id}/test`).then((r) => r.data),
}

// ─── Integrity ────────────────────────────────────────────
export const integrityApi = {
  check: (accountId?: string) =>
    api.get('/api/integrity/check', { params: accountId ? { accountId } : {} }).then((r) => r.data),
}

// ─── Config Export/Import ─────────────────────────────────
export const configApi = {
  exportConfig: () =>
    api.get('/api/config/export').then((r) => r.data),

  importConfig: (data: any) =>
    api.post('/api/config/import', data).then((r) => r.data),
}

// ─── Privacy ──────────────────────────────────────────────
export const privacyApi = {
  // Tracking pixels
  getTrackingStats: (accountId: string) =>
    api.get(`/api/privacy/${accountId}/tracking/stats`).then((r) => r.data),

  listTrackedMessages: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/privacy/${accountId}/tracking`, { params }).then((r) => r.data),

  scanTracking: (accountId: string, maxMessages?: number) =>
    api.post(`/api/privacy/${accountId}/tracking/scan`, { maxMessages }).then((r) => r.data),

  // PII scanner
  getPiiStats: (accountId: string) =>
    api.get(`/api/privacy/${accountId}/pii/stats`).then((r) => r.data),

  listPiiFindings: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/privacy/${accountId}/pii`, { params }).then((r) => r.data),

  scanPii: (accountId: string) =>
    api.post(`/api/privacy/${accountId}/pii/scan`).then((r) => r.data),

  // Encryption
  getEncryptionStatus: (accountId: string) =>
    api.get(`/api/privacy/${accountId}/encryption/status`).then((r) => r.data),

  setupEncryption: (passphrase: string) =>
    api.post('/api/privacy/encryption/setup', { passphrase }).then((r) => r.data),

  verifyEncryption: (passphrase: string) =>
    api.post('/api/privacy/encryption/verify', { passphrase }).then((r) => r.data),

  encryptArchives: (accountId: string, passphrase: string) =>
    api.post(`/api/privacy/${accountId}/encryption/encrypt`, { passphrase }).then((r) => r.data),

  decryptMail: (accountId: string, mailId: string, passphrase: string) =>
    api.post(`/api/privacy/${accountId}/encryption/decrypt-mail`, { mailId, passphrase }).then((r) => r.data),
}

// ─── Analytics ────────────────────────────────────────────
export const analyticsApi = {
  getHeatmap: (accountId: string, refresh = false) =>
    api.get(`/api/analytics/${accountId}/heatmap`, { params: refresh ? { refresh: '1' } : {} }).then((r) => r.data),

  getSenderScores: (accountId: string, refresh = false) =>
    api.get(`/api/analytics/${accountId}/sender-scores`, { params: refresh ? { refresh: '1' } : {} }).then((r) => r.data),

  getCleanupSuggestions: (accountId: string, refresh = false) =>
    api.get(`/api/analytics/${accountId}/cleanup-suggestions`, { params: refresh ? { refresh: '1' } : {} }).then((r) => r.data),

  dismissSuggestion: (suggestionId: string) =>
    api.patch(`/api/analytics/suggestions/${suggestionId}/dismiss`).then((r) => r.data),

  getInboxZero: (accountId: string, refresh = false) =>
    api.get(`/api/analytics/${accountId}/inbox-zero`, { params: refresh ? { refresh: '1' } : {} }).then((r) => r.data),

  recordSnapshot: (accountId: string) =>
    api.post(`/api/analytics/${accountId}/inbox-zero/snapshot`).then((r) => r.data),
}

// ─── Saved Searches ───────────────────────────────────────
export const savedSearchesApi = {
  list: () =>
    api.get('/api/saved-searches').then((r) => r.data),

  create: (data: { name: string; query: string; icon?: string; color?: string }) =>
    api.post('/api/saved-searches', data).then((r) => r.data),

  update: (searchId: string, data: Record<string, any>) =>
    api.put(`/api/saved-searches/${searchId}`, data).then((r) => r.data),

  remove: (searchId: string) =>
    api.delete(`/api/saved-searches/${searchId}`).then((r) => r.data),

  reorder: (ids: string[]) =>
    api.put('/api/saved-searches/reorder', { ids }).then((r) => r.data),
}

// ─── Unified Inbox ────────────────────────────────────────
export const unifiedApi = {
  listMessages: (params: Record<string, any> = {}) =>
    api.get('/api/unified/messages', { params }).then((r) => r.data),
}

// ─── Archive Threads ──────────────────────────────────────
export const archiveThreadsApi = {
  listThreads: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/archive/${accountId}/threads`, { params }).then((r) => r.data),

  getThread: (accountId: string, threadId: string) =>
    api.get(`/api/archive/${accountId}/threads/${threadId}`).then((r) => r.data),
}

// ─── Storage (S3/MinIO) ──────────────────────────────────
export const storageApi = {
  getConfig: () =>
    api.get('/api/storage/config').then((r) => r.data),

  saveConfig: (data: {
    type: 'local' | 's3'
    s3Endpoint?: string
    s3Region?: string
    s3Bucket?: string
    s3AccessKeyId?: string
    s3SecretAccessKey?: string
    s3ForcePathStyle?: boolean
  }) =>
    api.put('/api/storage/config', data).then((r) => r.data),

  testS3: (data: {
    endpoint: string
    region?: string
    bucket?: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle?: boolean
  }) =>
    api.post('/api/storage/test-s3', data).then((r) => r.data),
}

// ─── Retention Policies ──────────────────────────────────
export const retentionApi = {
  list: () =>
    api.get('/api/retention').then((r) => r.data),

  create: (data: { name: string; gmailAccountId?: string; label?: string; maxAgeDays: number }) =>
    api.post('/api/retention', data).then((r) => r.data),

  update: (policyId: string, data: Record<string, any>) =>
    api.put(`/api/retention/${policyId}`, data).then((r) => r.data),

  remove: (policyId: string) =>
    api.delete(`/api/retention/${policyId}`).then((r) => r.data),

  run: () =>
    api.post('/api/retention/run').then((r) => r.data),
}

// ─── Gmail API Quota ─────────────────────────────────────
export const quotaApi = {
  getStats: (accountId: string) =>
    api.get(`/api/quota/${accountId}`).then((r) => r.data),
}

// ─── Import (mbox / IMAP) ────────────────────────────────
export const importApi = {
  importMbox: (accountId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/api/import/${accountId}/mbox`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },

  importImap: (accountId: string, data: {
    host: string
    port: number
    secure?: boolean
    user: string
    pass: string
    folder?: string
    maxMessages?: number
  }) =>
    api.post(`/api/import/${accountId}/imap`, data).then((r) => r.data),

  exportMbox: (accountId: string, mailIds?: string[]) =>
    api.post(`/api/import/${accountId}/export-mbox`, { mailIds }, { responseType: 'blob' }).then((r) => r.data),
}

// ─── Email Expiration ─────────────────────────────────────
export const expirationApi = {
  list: (accountId: string) =>
    api.get(`/api/expiration/${accountId}`).then((r) => r.data),

  stats: (accountId: string) =>
    api.get(`/api/expiration/${accountId}/stats`).then((r) => r.data),

  create: (accountId: string, data: {
    gmailMessageId: string
    subject?: string
    sender?: string
    expiresAt?: string
    expiresInDays?: number
    category?: string
  }) =>
    api.post(`/api/expiration/${accountId}`, data).then((r) => r.data),

  createBatch: (accountId: string, items: Array<{
    gmailMessageId: string
    subject?: string
    sender?: string
    expiresInDays?: number
    category?: string
  }>) =>
    api.post(`/api/expiration/${accountId}/batch`, { items }).then((r) => r.data),

  detect: (accountId: string, messages: Array<{
    gmailMessageId: string
    subject?: string | null
    sender?: string | null
  }>) =>
    api.post(`/api/expiration/${accountId}/detect`, { messages }).then((r) => r.data),

  update: (accountId: string, expirationId: string, expiresAt: string) =>
    api.patch(`/api/expiration/${accountId}/${expirationId}`, { expiresAt }).then((r) => r.data),

  remove: (accountId: string, expirationId: string) =>
    api.delete(`/api/expiration/${accountId}/${expirationId}`).then((r) => r.data),
}

// ─── Archive Sharing ──────────────────────────────────────
export const sharingApi = {
  list: () =>
    api.get('/api/shares').then((r) => r.data),

  create: (data: {
    archivedMailId: string
    expiresInHours?: number
    maxAccess?: number
  }) =>
    api.post('/api/shares', data).then((r) => r.data),

  revoke: (shareId: string) =>
    api.delete(`/api/shares/${shareId}`).then((r) => r.data),

  getPublic: (token: string) =>
    api.get(`/api/shares/public/${token}`).then((r) => r.data),
}
