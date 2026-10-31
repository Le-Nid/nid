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

  /** `color`: Gmail accepts only its own palette. */
  updateLabel: (accountId: string, labelId: string, body: { name?: string; color?: { backgroundColor: string; textColor: string } }) =>
    api.patch(`/api/gmail/${accountId}/labels/${labelId}`, body).then((r) => r.data),

  deleteLabel: (accountId: string, labelId: string) =>
    api.delete(`/api/gmail/${accountId}/labels/${labelId}`).then((r) => r.data),

  getAttachment: (accountId: string, messageId: string, attachmentId: string) =>
    api.get(`/api/gmail/${accountId}/messages/${messageId}/attachments/${attachmentId}`).then((r) => r.data),

  /** `messageIds` or `query` (B5 select-all); no `delayMs` = the server's 10 s undo window (D1). */
  bulkOperation: (
    accountId: string,
    body: { action: string; labelId?: string; delayMs?: number } & ({ messageIds: string[] } | { query: string }),
  ) => api.post(`/api/gmail/${accountId}/messages/bulk`, body).then((r) => r.data),
}

// ─── Labels (synced `gmail_labels`, B4) ───────────────────
export const labelsApi = {
  list: (accountId: string) => api.get(`/api/labels/${accountId}`).then((r) => r.data),
  /** « Synchroniser maintenant »: labels and their counts, read again from Gmail. */
  sync: (accountId: string) => api.post(`/api/labels/${accountId}/sync`).then((r) => r.data),
}

// ─── Gmail accounts (Paramètres > Comptes Gmail) ──────────
export type BackupInterval = '1h' | '6h' | '24h'

export const gmailAccountsApi = {
  /** Google consent URL; the callback adds the account or refreshes its tokens (« Reconnecter »). */
  connectUrl: () => api.get('/api/auth/gmail/connect').then((r) => r.data as { url: string }),
  /** B12: automatic NAS backup. */
  update: (accountId: string, body: { backup_enabled?: boolean; backup_interval?: BackupInterval }) =>
    api.patch(`/api/auth/gmail/${accountId}`, body).then((r) => r.data),
  /** Soft disconnect: Gmail access stops, the account and its archives stay in Nid. */
  disconnect: (accountId: string) => api.delete(`/api/auth/gmail/${accountId}`).then((r) => r.data),
}

// ─── Account shares (read-only access to an account's archive) ──
export type AccountShare = { user_id: string; email: string; display_name: string | null; created_at: string }

export const accountSharesApi = {
  list: (accountId: string): Promise<AccountShare[]> => api.get(`/api/auth/accounts/${accountId}/shares`).then((r) => r.data),
  add: (accountId: string, email: string): Promise<AccountShare> =>
    api.post(`/api/auth/accounts/${accountId}/shares`, { email }).then((r) => r.data),
  /** The owner revokes; the user it is shared with leaves (their own id). */
  remove: (accountId: string, userId: string) => api.delete(`/api/auth/accounts/${accountId}/shares/${userId}`).then((r) => r.data),
}

export interface ImapSettings { host: string; port: number; secure: boolean; user: string; password: string }

// ─── IMAP accounts (archive only) ─────────────────────────
export const imapAccountsApi = {
  /** The server tests the login first; 400 carries its reason. */
  create: (body: ImapSettings & { email: string }) => api.post('/api/auth/imap', body).then((r) => r.data as { id: string; email: string }),
  update: (accountId: string, body: ImapSettings) => api.put(`/api/auth/imap/${accountId}`, body).then((r) => r.data),
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

  trashMails: (accountId: string, mailIds: string[]) =>
    api.post(`/api/archive/${accountId}/mails/trash`, { mailIds }).then((r) => r.data),

  restoreMails: (accountId: string, mailIds: string[]) =>
    api.post(`/api/archive/${accountId}/mails/restore`, { mailIds }).then((r) => r.data),

  restoreToGmail: (accountId: string, mailIds: string[]): Promise<{ jobId: string }> =>
    api.post(`/api/archive/${accountId}/mails/restore-gmail`, { mailIds }).then((r) => r.data),

  listContacts: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/archive/${accountId}/contacts`, { params }).then((r) => r.data),

  listTags: (accountId: string): Promise<{ tag: string; count: number }[]> =>
    api.get(`/api/archive/${accountId}/tags`).then((r) => r.data),

  tagMails: (accountId: string, change: { mailIds: string[]; add?: string[]; remove?: string[] }) =>
    api.post(`/api/archive/${accountId}/mails/tags`, change).then((r) => r.data),

  deleteTag: (accountId: string, tag: string) =>
    api.delete(`/api/archive/${accountId}/tags/${encodeURIComponent(tag)}`).then((r) => r.data),

  listTrash: (accountId: string, params: Record<string, any> = {}) =>
    api.get(`/api/archive/${accountId}/trash`, { params }).then((r) => r.data),

  emptyTrash: (accountId: string) =>
    api.delete(`/api/archive/${accountId}/trash`).then((r) => r.data),

  getTrashConfig: () =>
    api.get('/api/archive/config/trash').then((r) => r.data),

  updateTrashConfig: (data: { retentionDays?: number; purgeEnabled?: boolean }) =>
    api.put('/api/archive/config/trash', data).then((r) => r.data),
}

// ─── Rules ────────────────────────────────────────────────
export const rulesApi = {
  list: (accountId: string) =>
    api.get(`/api/rules/${accountId}`).then((r) => r.data),

  get: (accountId: string, ruleId: string) =>
    api.get(`/api/rules/${accountId}/${ruleId}`).then((r) => r.data),

  /** `{ active, processed30d }` (Vue d'ensemble). */
  getStats: (accountId: string) =>
    api.get(`/api/rules/${accountId}/stats`).then((r) => r.data),

  create: (accountId: string, dto: any) =>
    api.post(`/api/rules/${accountId}`, dto).then((r) => r.data),

  update: (accountId: string, ruleId: string, dto: any) =>
    api.put(`/api/rules/${accountId}/${ruleId}`, dto).then((r) => r.data),

  toggle: (accountId: string, ruleId: string) =>
    api.patch(`/api/rules/${accountId}/${ruleId}/toggle`).then((r) => r.data),

  delete: (accountId: string, ruleId: string) =>
    api.delete(`/api/rules/${accountId}/${ruleId}`).then((r) => r.data),

  /** No `delayMs` = the server's 10 s undo window (D1). */
  run: (accountId: string, ruleId: string) =>
    api.post(`/api/rules/${accountId}/${ruleId}/run`, {}).then((r) => r.data),

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

  retry: (jobId: string) =>
    api.post(`/api/jobs/${jobId}/retry`).then((r) => r.data),
}

// ─── Auth (Social providers — Google, Microsoft, Discord, etc.) ──
export const authApi = {
  getSocialAuthUrl: (provider: string) =>
    api.get(`/api/auth/social/${provider}/url`).then((r) => r.data),

  /** Always 204 (no user enumeration); 404 when SMTP is not configured. */
  forgotPassword: (email: string) =>
    api.post('/api/auth/password/forgot', { email }).then((r) => r.data),

  /** `token` from the e-mailed link; 400 when unknown, used or expired. */
  resetPassword: (token: string, newPassword: string) =>
    api.post('/api/auth/password/reset', { token, newPassword }).then((r) => r.data),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch('/api/auth/password', body).then((r) => r.data),

  /** GDPR export: everything Nid stores about the user, as JSON. */
  exportMyData: () =>
    api.get('/api/auth/me/export').then((r) => r.data),

  /** Irreversible. `password` for a local account, `email` for an SSO-only one. */
  deleteMe: (body: { password?: string; email?: string }) =>
    api.delete('/api/auth/me', { data: body }).then((r) => r.data),
}

// ─── About (version, update check) ──────────────────────
export const aboutApi = {
  get: () =>
    api.get('/api/about').then((r) => r.data),
}

// ─── Passkeys (WebAuthn) ──────────────────────────────────
export const passkeysApi = {
  list: () =>
    api.get('/api/auth/passkeys').then((r) => r.data),

  registerOptions: () =>
    api.post('/api/auth/passkeys/register/options').then((r) => r.data),

  registerVerify: (name: string, response: unknown) =>
    api.post('/api/auth/passkeys/register/verify', { name, response }).then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/api/auth/passkeys/${id}`).then((r) => r.data),

  loginOptions: () =>
    api.post('/api/auth/passkeys/login/options').then((r) => r.data),

  loginVerify: (challengeId: string, response: unknown) =>
    api.post('/api/auth/passkeys/login/verify', { challengeId, response }).then((r) => r.data),
}

// ─── API tokens (Home Assistant, scripts) ─────────────────
export const apiTokensApi = {
  list: () =>
    api.get('/api/auth/api-tokens').then((r) => r.data),

  create: (body: { name: string; scope: 'read' | 'write'; expires_in_days: number | null }) =>
    api.post('/api/auth/api-tokens', body).then((r) => r.data),

  revoke: (id: string) =>
    api.delete(`/api/auth/api-tokens/${id}`).then((r) => r.data),
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

  /** Sets a new password and signs the user out everywhere. */
  resetPassword: (userId: string, password: string) =>
    api.post(`/api/admin/users/${userId}/password`, { password }).then((r) => r.data),

  /** Irreversible: the user, their Gmail accounts and archives. */
  deleteUser: (userId: string) =>
    api.delete(`/api/admin/users/${userId}`).then((r) => r.data),

  listJobs: (params: Record<string, any> = {}) =>
    api.get('/api/admin/jobs', { params }).then((r) => r.data),

  /** Instance Gmail API quota (B13). */
  getQuota: () =>
    api.get('/api/admin/quota').then((r) => r.data),

  /** Instance audit log (B14): `user` = email substring, `action` = exact action. */
  listAudit: (params: Record<string, any> = {}) =>
    api.get('/api/admin/audit', { params }).then((r) => r.data),

  /** Instance archive trash volume and last integrity check (B15). */
  getSystem: () =>
    api.get('/api/admin/system').then((r) => r.data),

  emptyArchiveTrash: () =>
    api.delete('/api/admin/archive-trash').then((r) => r.data),
}

// ─── Unsubscribe ──────────────────────────────────────────
export const unsubscribeApi = {
  /** Last scan, from the server's cache: `{ senders, scannedAt }`, scannedAt null = never scanned. */
  getNewsletters: (accountId: string) =>
    api.get(`/api/unsubscribe/${accountId}/newsletters`).then((r) => r.data),

  scanAsync: (accountId: string) =>
    api.post(`/api/unsubscribe/${accountId}/scan`).then((r) => r.data),

  getMessageIds: (accountId: string, senderEmail: string) =>
    api.get(`/api/unsubscribe/${accountId}/newsletters/${encodeURIComponent(senderEmail)}/messages`).then((r) => r.data),

  /** Trash every mail of the sender after the server's 10 s undo window (D1): `{ jobId, runAt, count }`. */
  deleteSender: (accountId: string, senderEmail: string) =>
    api.post(`/api/unsubscribe/${accountId}/newsletters/${encodeURIComponent(senderEmail)}/delete`, {}).then((r) => r.data),
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

  /** Notification switches, plus the reader's `remote_images: 'block' | 'allow'` (B10). */
  updatePreferences: (prefs: Record<string, boolean | string>) =>
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

  create: (data: { name: string; url: string; type: string; events: string[]; auth_user?: string; auth_password?: string }) =>
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

  /** Whole-instance check as a job: `{ jobId }`. */
  checkAsync: () =>
    api.post('/api/integrity/check/async').then((r) => r.data),
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
