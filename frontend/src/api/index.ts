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
    api.delete(`/api/rules/${accountId}/${ruleId}`),

  run: (accountId: string, ruleId: string) =>
    api.post(`/api/rules/${accountId}/${ruleId}/run`).then((r) => r.data),

  preview: (accountId: string, conditions: any[]) =>
    api.post(`/api/rules/${accountId}/preview`, { conditions }).then((r) => r.data),
}

// ─── Jobs ─────────────────────────────────────────────────
export const jobsApi = {
  list: (params: Record<string, any> = {}) =>
    api.get('/api/jobs', { params }).then((r) => r.data),

  get: (jobId: string) =>
    api.get(`/api/jobs/${jobId}`).then((r) => r.data),

  cancel: (jobId: string) =>
    api.delete(`/api/jobs/${jobId}`),
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
