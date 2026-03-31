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

// ─── Auth (Google SSO) ────────────────────────────────────
export const authApi = {
  getGoogleSsoUrl: () =>
    api.get('/api/auth/google').then((r) => r.data),
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
