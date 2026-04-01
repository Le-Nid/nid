import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  dashboardApi, gmailApi, archiveApi, rulesApi, jobsApi,
  adminApi, unsubscribeApi, attachmentsApi, reportsApi,
  duplicatesApi, analyticsApi, privacyApi, notificationsApi,
  auditApi, webhooksApi, savedSearchesApi, unifiedApi, archiveThreadsApi,
} from '../api'

// ─── Query key factories ──────────────────────────────────

export const queryKeys = {
  dashboard: (accountId: string) => ['dashboard', accountId] as const,
  dashboardArchive: (accountId: string) => ['dashboard', accountId, 'archive'] as const,
  gmailMessages: (accountId: string, query?: string, filter?: string) =>
    ['gmail', accountId, 'messages', query, filter] as const,
  gmailLabels: (accountId: string) => ['gmail', accountId, 'labels'] as const,
  archiveMails: (accountId: string, params?: Record<string, any>) =>
    ['archive', accountId, 'mails', params] as const,
  archiveMail: (accountId: string, mailId: string) =>
    ['archive', accountId, 'mail', mailId] as const,
  archiveThreads: (accountId: string, params?: Record<string, any>) =>
    ['archive', accountId, 'threads', params] as const,
  archiveThread: (accountId: string, threadId: string) =>
    ['archive', accountId, 'thread', threadId] as const,
  savedSearches: () => ['saved-searches'] as const,
  unified: (params?: Record<string, any>) => ['unified', params] as const,
  rules: (accountId: string) => ['rules', accountId] as const,
  ruleTemplates: () => ['rules', 'templates'] as const,
  jobs: (params?: Record<string, any>) => ['jobs', params] as const,
  admin: {
    stats: () => ['admin', 'stats'] as const,
    users: (params?: Record<string, any>) => ['admin', 'users', params] as const,
    jobs: (params?: Record<string, any>) => ['admin', 'jobs', params] as const,
  },
  unsubscribe: (accountId: string) => ['unsubscribe', accountId] as const,
  attachments: {
    archived: (accountId: string, params?: Record<string, any>) =>
      ['attachments', accountId, 'archived', params] as const,
    live: (accountId: string, params?: Record<string, any>) =>
      ['attachments', accountId, 'live', params] as const,
  },
  insights: () => ['insights'] as const,
  duplicates: (accountId: string) => ['duplicates', accountId] as const,
  analytics: {
    heatmap: (accountId: string) => ['analytics', accountId, 'heatmap'] as const,
    senderScores: (accountId: string) => ['analytics', accountId, 'senderScores'] as const,
    suggestions: (accountId: string) => ['analytics', accountId, 'suggestions'] as const,
    inboxZero: (accountId: string) => ['analytics', accountId, 'inboxZero'] as const,
  },
  privacy: {
    trackingStats: (accountId: string) => ['privacy', accountId, 'tracking', 'stats'] as const,
    trackedMessages: (accountId: string, params?: Record<string, any>) =>
      ['privacy', accountId, 'tracking', 'messages', params] as const,
    piiStats: (accountId: string) => ['privacy', accountId, 'pii', 'stats'] as const,
    piiFindings: (accountId: string, params?: Record<string, any>) =>
      ['privacy', accountId, 'pii', 'findings', params] as const,
    encryption: (accountId: string) => ['privacy', accountId, 'encryption'] as const,
  },
  notifications: {
    preferences: () => ['notifications', 'preferences'] as const,
  },
  audit: (params?: Record<string, any>) => ['audit', params] as const,
  webhooks: () => ['webhooks'] as const,
}

// ─── Dashboard ────────────────────────────────────────────

export function useDashboardStats(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard(accountId!),
    queryFn: () => dashboardApi.getStats(accountId!, 20),
    enabled: !!accountId,
  })
}

export function useDashboardArchiveStats(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboardArchive(accountId!),
    queryFn: () => dashboardApi.getArchiveStats(accountId!),
    enabled: !!accountId,
  })
}

// ─── Gmail ────────────────────────────────────────────────

export function useGmailLabels(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.gmailLabels(accountId!),
    queryFn: () => gmailApi.listLabels(accountId!),
    enabled: !!accountId,
  })
}

// ─── Archive ──────────────────────────────────────────────

export function useArchiveMails(accountId: string | null, params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.archiveMails(accountId!, params),
    queryFn: () => archiveApi.listMails(accountId!, params),
    enabled: !!accountId,
  })
}

// ─── Rules ────────────────────────────────────────────────

export function useRules(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.rules(accountId!),
    queryFn: () => rulesApi.list(accountId!),
    enabled: !!accountId,
  })
}

export function useRuleTemplates(enabled = false) {
  return useQuery({
    queryKey: queryKeys.ruleTemplates(),
    queryFn: () => rulesApi.getTemplates(),
    enabled,
  })
}

export function useToggleRule(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => rulesApi.toggle(accountId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules(accountId) }),
  })
}

export function useDeleteRule(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => rulesApi.delete(accountId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules(accountId) }),
  })
}

export function useRunRule(accountId: string) {
  return useMutation({
    mutationFn: (ruleId: string) => rulesApi.run(accountId, ruleId),
  })
}

// ─── Jobs ─────────────────────────────────────────────────

export function useJobs(params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.jobs(params),
    queryFn: () => jobsApi.list(params),
  })
}

export function useCancelJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => jobsApi.cancel(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

// ─── Admin ────────────────────────────────────────────────

export function useAdminStats() {
  return useQuery({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => adminApi.getStats(),
  })
}

export function useAdminUsers(params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: () => adminApi.listUsers(params),
  })
}

export function useAdminJobs(params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.admin.jobs(params),
    queryFn: () => adminApi.listJobs(params),
  })
}

export function useUpdateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: Record<string, any> }) =>
      adminApi.updateUser(userId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

// ─── Unsubscribe ──────────────────────────────────────────

export function useNewsletters(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.unsubscribe(accountId!),
    queryFn: () => unsubscribeApi.scanNewsletters(accountId!),
    enabled: !!accountId,
  })
}

export function useDeleteSender(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, permanent }: { email: string; permanent: boolean }) =>
      unsubscribeApi.deleteSender(accountId, email, permanent),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.unsubscribe(accountId) }),
  })
}

// ─── Attachments ──────────────────────────────────────────

export function useArchivedAttachments(accountId: string | null, params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.attachments.archived(accountId!, params),
    queryFn: () => attachmentsApi.listArchived(accountId!, params),
    enabled: !!accountId,
  })
}

export function useLiveAttachments(accountId: string | null, params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.attachments.live(accountId!, params),
    queryFn: () => attachmentsApi.listLive(accountId!, params),
    enabled: !!accountId,
  })
}

// ─── Insights ─────────────────────────────────────────────

export function useWeeklyReport() {
  return useQuery({
    queryKey: queryKeys.insights(),
    queryFn: () => reportsApi.getWeekly(),
  })
}

// ─── Duplicates ───────────────────────────────────────────

export function useDuplicates(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.duplicates(accountId!),
    queryFn: () => duplicatesApi.detectArchived(accountId!),
    enabled: !!accountId,
  })
}

export function useDeleteDuplicates(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mailIds: string[]) => duplicatesApi.deleteArchived(accountId, mailIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.duplicates(accountId) }),
  })
}

// ─── Analytics ────────────────────────────────────────────

export function useAnalytics(accountId: string | null, refresh = false) {
  const heatmap = useQuery({
    queryKey: queryKeys.analytics.heatmap(accountId!),
    queryFn: () => analyticsApi.getHeatmap(accountId!, refresh),
    enabled: !!accountId,
  })
  const senderScores = useQuery({
    queryKey: queryKeys.analytics.senderScores(accountId!),
    queryFn: () => analyticsApi.getSenderScores(accountId!, refresh),
    enabled: !!accountId,
  })
  const suggestions = useQuery({
    queryKey: queryKeys.analytics.suggestions(accountId!),
    queryFn: () => analyticsApi.getCleanupSuggestions(accountId!, refresh),
    enabled: !!accountId,
  })
  const inboxZero = useQuery({
    queryKey: queryKeys.analytics.inboxZero(accountId!),
    queryFn: () => analyticsApi.getInboxZero(accountId!, refresh),
    enabled: !!accountId,
  })
  return { heatmap, senderScores, suggestions, inboxZero }
}

export function useDismissSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => analyticsApi.dismissSuggestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics'] }),
  })
}

// ─── Privacy ──────────────────────────────────────────────

export function useTrackingStats(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.privacy.trackingStats(accountId!),
    queryFn: () => privacyApi.getTrackingStats(accountId!),
    enabled: !!accountId,
  })
}

export function useTrackedMessages(accountId: string | null, params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.privacy.trackedMessages(accountId!, params),
    queryFn: () => privacyApi.listTrackedMessages(accountId!, params),
    enabled: !!accountId,
  })
}

export function usePiiStats(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.privacy.piiStats(accountId!),
    queryFn: () => privacyApi.getPiiStats(accountId!),
    enabled: !!accountId,
  })
}

export function usePiiFindings(accountId: string | null, params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.privacy.piiFindings(accountId!, params),
    queryFn: () => privacyApi.listPiiFindings(accountId!, params),
    enabled: !!accountId,
  })
}

export function useEncryptionStatus(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.privacy.encryption(accountId!),
    queryFn: () => privacyApi.getEncryptionStatus(accountId!),
    enabled: !!accountId,
  })
}

// ─── Notifications ────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: () => notificationsApi.getPreferences(),
  })
}

// ─── Audit ────────────────────────────────────────────────

export function useAuditLogs(params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.audit(params),
    queryFn: () => auditApi.list(params),
  })
}

// ─── Webhooks ─────────────────────────────────────────────

export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.webhooks(),
    queryFn: () => webhooksApi.list(),
  })
}

// ─── Saved Searches ───────────────────────────────────────

export function useSavedSearches() {
  return useQuery({
    queryKey: queryKeys.savedSearches(),
    queryFn: () => savedSearchesApi.list(),
  })
}

export function useCreateSavedSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; query: string; icon?: string; color?: string }) =>
      savedSearchesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedSearches() }),
  })
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (searchId: string) => savedSearchesApi.remove(searchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedSearches() }),
  })
}

export function useUpdateSavedSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, any>) =>
      savedSearchesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedSearches() }),
  })
}

// ─── Unified Inbox ────────────────────────────────────────

export function useUnifiedMessages(params: Record<string, any>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.unified(params),
    queryFn: () => unifiedApi.listMessages(params),
    enabled,
  })
}

// ─── Archive Threads ──────────────────────────────────────

export function useArchiveThreads(accountId: string | null, params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.archiveThreads(accountId!, params),
    queryFn: () => archiveThreadsApi.listThreads(accountId!, params),
    enabled: !!accountId,
  })
}

export function useArchiveThread(accountId: string | null, threadId: string | null) {
  return useQuery({
    queryKey: queryKeys.archiveThread(accountId!, threadId!),
    queryFn: () => archiveThreadsApi.getThread(accountId!, threadId!),
    enabled: !!accountId && !!threadId,
  })
}
