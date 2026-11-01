import { keepPreviousData, useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  dashboardApi, gmailApi, archiveApi, rulesApi, jobsApi,
  adminApi, unsubscribeApi, attachmentsApi,
  analyticsApi, notificationsApi, privacyApi,
  webhooksApi, savedSearchesApi, unifiedApi, archiveThreadsApi,
  retentionApi, importApi,
  sharingApi, labelsApi, gmailAccountsApi, accountSharesApi, twoFactorApi, configApi, integrityApi, authApi, aboutApi, passkeysApi, apiTokensApi, imapAccountsApi,
} from '../api'
import type { ImapScope } from '../api'
import { startRegistration } from '@simplewebauthn/browser'
import { useAuthStore } from '../store/auth.store'

// ─── Query key factories ──────────────────────────────────

export const queryKeys = {
  dashboard: (accountId: string) => ['dashboard', accountId] as const,
  dashboardArchive: (accountId: string) => ['dashboard', accountId, 'archive'] as const,
  gmailMessages: (accountId: string, query?: string, filter?: string) =>
    ['gmail', accountId, 'messages', query, filter] as const,
  gmailMessage: (accountId: string, messageId: string) => ['gmail', accountId, 'message', messageId] as const,
  labels: (accountId: string) => ['labels', accountId] as const,
  archiveMails: (accountId: string, params?: Record<string, any>) =>
    ['archive', accountId, 'mails', params] as const,
  archiveMail: (accountId: string, mailId: string) =>
    ['archive', accountId, 'mail', mailId] as const,
  archiveThread: (accountId: string, threadId: string) =>
    ['archive', accountId, 'thread', threadId] as const,
  archiveTrash: (accountId: string, params?: Record<string, any>) =>
    ['archive', accountId, 'trash', params] as const,
  archiveTrashConfig: () => ['archive', 'trash-config'] as const,
  archiveTags: (accountId: string) => ['archive', accountId, 'tags'] as const,
  archiveContacts: (accountId: string, q: string) => ['archive', accountId, 'contacts', q] as const,
  savedSearches: () => ['saved-searches'] as const,
  unified: (params?: Record<string, any>) => ['unified', params] as const,
  rules: (accountId: string) => ['rules', accountId] as const,
  ruleTemplates: () => ['rules', 'templates'] as const,
  // Under rules(accountId): a rule change refreshes the stats too
  ruleStats: (accountId: string) => ['rules', accountId, 'stats'] as const,
  jobs: (params?: Record<string, any>) => ['jobs', params] as const,
  admin: {
    users: (params?: Record<string, any>) => ['admin', 'users', params] as const,
    jobs: (params?: Record<string, any>) => ['admin', 'jobs', params] as const,
    quota: () => ['admin', 'quota'] as const,
    audit: (params?: Record<string, any>) => ['admin', 'audit', params] as const,
    system: () => ['admin', 'system'] as const,
  },
  unsubscribe: (accountId: string) => ['unsubscribe', accountId] as const,
  attachments: {
    archived: (accountId: string, params?: Record<string, any>) =>
      ['attachments', accountId, 'archived', params] as const,
    live: (accountId: string, params?: Record<string, any>) =>
      ['attachments', accountId, 'live', params] as const,
    dedupStats: () => ['attachments', 'dedup-stats'] as const,
  },
  analytics: {
    suggestions: (accountId: string) => ['analytics', accountId, 'suggestions'] as const,
    heatmap: (accountId: string) => ['analytics', accountId, 'heatmap'] as const,
    inboxZero: (accountId: string) => ['analytics', accountId, 'inbox-zero'] as const,
  },
  notifications: {
    preferences: () => ['notifications', 'preferences'] as const,
  },
  webhooks: () => ['webhooks'] as const,
  retention: () => ['retention'] as const,
  shares: () => ['shares'] as const,
  about: () => ['about'] as const,
  passkeys: () => ['passkeys'] as const,
  apiTokens: () => ['api-tokens'] as const,
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

/** Synced labels (`GET /api/labels/:id`): Gmail colors, deleted ones kept so archives still show their names. */
export function useLabels(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.labels(accountId!),
    queryFn: () => labelsApi.list(accountId!),
    enabled: !!accountId,
  })
}

/** A mutation that refetches `queryKey` once it succeeded. */
function useInvalidatingMutation<T>(fn: (input: T) => Promise<unknown>, queryKey: readonly unknown[]) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey }) })
}

/** Label edits go to Gmail; the synced list (`['labels']`) is refetched after each. */
const useLabelMutation = <T,>(fn: (input: T) => Promise<unknown>) => useInvalidatingMutation(fn, ['labels'])

export const useCreateLabel = (accountId: string) =>
  useLabelMutation((name: string) => gmailApi.createLabel(accountId, name))

export const useUpdateLabel = (accountId: string) =>
  useLabelMutation(({ labelId, ...body }: { labelId: string } & Parameters<typeof gmailApi.updateLabel>[2]) =>
    gmailApi.updateLabel(accountId, labelId, body))

export const useDeleteLabel = (accountId: string) =>
  useLabelMutation((labelId: string) => gmailApi.deleteLabel(accountId, labelId))

// Each page = one Gmail list call (20 ids) + one batchGet of those ids; pageParam is Gmail's nextPageToken
export function useGmailMessages(accountId: string | null, query: string, quickFilter: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.gmailMessages(accountId!, query, quickFilter),
    queryFn: async ({ pageParam }) => {
      const q = [quickFilter, query].filter(Boolean).join(' ')
      const res = await gmailApi.listMessages(accountId!, { q: q || undefined, maxResults: 20, pageToken: pageParam })
      const ids: string[] = (res.messages ?? []).map((m: { id: string }) => m.id)
      // The batch endpoint rejects an empty id list
      const mails: any[] = ids.length ? await gmailApi.batchGetMessages(accountId!, ids) : []
      return { mails, total: (res.resultSizeEstimate ?? 0) as number, nextPageToken: res.nextPageToken as string | undefined }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: !!accountId,
  })
}

export function useGmailMessage(accountId: string | null, messageId: string | null) {
  return useQuery({
    queryKey: queryKeys.gmailMessage(accountId!, messageId!),
    queryFn: () => gmailApi.getMessageFull(accountId!, messageId!),
    enabled: !!accountId && !!messageId,
  })
}

// ─── Archive ──────────────────────────────────────────────

const ARCHIVE_PAGE_SIZE = 50

/** Archive search (B2): `q` full text with a `highlight` per mail, filters, « Afficher plus » pages. */
export function useArchiveMails(accountId: string | null, params: Record<string, any>) {
  return useInfiniteQuery({
    queryKey: queryKeys.archiveMails(accountId!, params),
    queryFn: ({ pageParam }) => archiveApi.listMails(accountId!, { ...params, page: pageParam, limit: ARCHIVE_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.length * ARCHIVE_PAGE_SIZE < last.total ? pages.length + 1 : undefined),
    enabled: !!accountId,
  })
}

export function useArchiveMail(accountId: string | null, mailId: string | null) {
  return useQuery({
    queryKey: queryKeys.archiveMail(accountId!, mailId!),
    queryFn: () => archiveApi.getMail(accountId!, mailId!),
    enabled: !!accountId && !!mailId,
  })
}

/** Archive edits refresh every archive list (search, trash) and the archive stats. */
function useArchiveMutation<T, R>(fn: (input: T) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['archive'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]),
  })
}

export const useTrashArchived = (accountId: string) =>
  useArchiveMutation((mailIds: string[]) => archiveApi.trashMails(accountId, mailIds))

export const useRestoreArchived = (accountId: string) =>
  useArchiveMutation((mailIds: string[]) => archiveApi.restoreMails(accountId, mailIds))

/** The archive's address book (From / To), most exchanged first, « Afficher plus » pages. */
export function useArchiveContacts(accountId: string, q: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.archiveContacts(accountId, q),
    queryFn: ({ pageParam }) => archiveApi.listContacts(accountId, { ...(q ? { q } : {}), page: pageParam, limit: ARCHIVE_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.length * ARCHIVE_PAGE_SIZE < last.total ? pages.length + 1 : undefined),
    enabled: !!accountId,
  })
}

export function useRestoreToMailbox(accountId: string) {
  return useMutation({ mutationFn: (mailIds: string[]) => archiveApi.restoreToMailbox(accountId, mailIds) })
}

/** Archives still encrypted by the removed encryption feature (the decrypt card shows only when > 0). */
export function useEncryptionStatus(accountId: string) {
  return useQuery({ queryKey: ['archive', accountId, 'encryption'], queryFn: () => privacyApi.getEncryptionStatus(accountId) })
}
export function useDecryptArchives(accountId: string) {
  return useMutation({ mutationFn: (passphrase: string) => privacyApi.decryptAll(accountId, passphrase) })
}

export function useArchiveTags(accountId: string) {
  return useQuery({ queryKey: queryKeys.archiveTags(accountId), queryFn: () => archiveApi.listTags(accountId), enabled: !!accountId })
}

export const useTagArchived = (accountId: string) =>
  useArchiveMutation((change: { mailIds: string[]; add?: string[]; remove?: string[] }) => archiveApi.tagMails(accountId, change))

export const useDeleteArchiveTag = (accountId: string) =>
  useArchiveMutation((tag: string) => archiveApi.deleteTag(accountId, tag))

export const useEmptyArchiveTrash = (accountId: string) =>
  useArchiveMutation(() => archiveApi.emptyTrash(accountId))

export const useUpdateTrashConfig = () =>
  useArchiveMutation((data: Parameters<typeof archiveApi.updateTrashConfig>[0]) => archiveApi.updateTrashConfig(data))

/** « Sauvegarder sur le NAS maintenant »: differential archive of the whole mailbox. */
export function useArchiveNow(accountId: string) {
  return useMutation({ mutationFn: () => archiveApi.triggerArchive(accountId, { differential: true }) as Promise<{ jobId: string }> })
}

export function useArchiveTrash(accountId: string | null, params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.archiveTrash(accountId!, params),
    queryFn: () => archiveApi.listTrash(accountId!, params),
    enabled: !!accountId,
  })
}

export function useArchiveTrashConfig() {
  return useQuery({
    queryKey: queryKeys.archiveTrashConfig(),
    queryFn: () => archiveApi.getTrashConfig(),
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

/** « Règles actives » KPI: active rules and mails their runs processed over 30 days. */
export function useRuleStats(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.ruleStats(accountId!),
    queryFn: () => rulesApi.getStats(accountId!) as Promise<{ active: number; processed30d: number }>,
    enabled: !!accountId,
  })
}

export function useRuleTemplates() {
  return useQuery({
    queryKey: queryKeys.ruleTemplates(),
    queryFn: () => rulesApi.getTemplates(),
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

/** I3: what the conditions match now: Gmail estimate, size and a few samples (B6). */
export function useRulePreview(accountId: string | null, conditions: unknown[] | null) {
  return useQuery({
    queryKey: ['rules', accountId, 'preview', conditions] as const,
    queryFn: () => rulesApi.preview(accountId!, conditions!),
    enabled: !!accountId && !!conditions,
    placeholderData: (previous) => previous, // keep the last figures while the next ones load
  })
}

export function useCreateRule(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: unknown) => rulesApi.create(accountId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules(accountId) }),
  })
}

export function useUpdateRule(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, dto }: { ruleId: string; dto: unknown }) => rulesApi.update(accountId, ruleId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules(accountId) }),
  })
}

export function useRunRule(accountId: string) {
  return useMutation({
    mutationFn: (ruleId: string) => rulesApi.run(accountId, ruleId) as Promise<{ jobId: string; runAt: string }>,
  })
}

/** Idempotent (200 = the existing rule); may create the template's Gmail label. */
export function useCreateRuleFromTemplate(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => rulesApi.createFromTemplate(accountId, templateId),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.rules(accountId) }),
      qc.invalidateQueries({ queryKey: ['labels'] }),
    ]),
  })
}

// ─── Jobs ─────────────────────────────────────────────────

export function useJobs(params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.jobs(params),
    queryFn: () => jobsApi.list(params),
  })
}

/** Activité (§7.6): the list plus the per-status counts of the chips; « Afficher plus » keeps the rows on screen. */
export function useActivity(params: { accountId?: string; status?: string; limit: number }) {
  return useQuery({
    queryKey: queryKeys.jobs({ ...params, withCounts: true }),
    queryFn: () => jobsApi.list({ ...params, withCounts: true }),
    placeholderData: keepPreviousData,
  })
}

export function useCancelJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => jobsApi.cancel(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useRetryJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => jobsApi.retry(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

// ─── Admin ────────────────────────────────────────────────

export function useAdminUsers(params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: () => adminApi.listUsers(params),
    placeholderData: (previous) => previous, // no skeleton flash between pages and keystrokes
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

export const useAdminResetPassword = () => useMutation({
  mutationFn: ({ userId, password }: { userId: string; password: string }) => adminApi.resetPassword(userId, password),
})

export function useAdminDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

export function useAdminQuota() {
  return useQuery({
    queryKey: queryKeys.admin.quota(),
    queryFn: () => adminApi.getQuota(),
    refetchInterval: 30_000,
  })
}

export function useAdminAudit(params: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.admin.audit(params),
    queryFn: () => adminApi.listAudit(params),
    placeholderData: (previous) => previous,
  })
}

export function useAdminSystem() {
  return useQuery({
    queryKey: queryKeys.admin.system(),
    queryFn: () => adminApi.getSystem(),
  })
}

/** Instance trash (B15); per-account trash lists are stale afterwards too. */
export function useEmptyInstanceTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.emptyArchiveTrash(),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.admin.system() }),
      qc.invalidateQueries({ queryKey: ['archive'] }),
    ]),
  })
}

export function useRunIntegrityCheck() {
  return useMutation({ mutationFn: () => integrityApi.checkAsync() })
}

// ─── Unsubscribe ──────────────────────────────────────────

export function useNewsletters(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.unsubscribe(accountId!),
    queryFn: () => unsubscribeApi.getNewsletters(accountId!),
    enabled: !!accountId,
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

export function useDedupStats() {
  return useQuery({
    queryKey: queryKeys.attachments.dedupStats(),
    queryFn: () => attachmentsApi.getDedupStats(),
  })
}

export function useDedupBackfill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => attachmentsApi.runDedupBackfill(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.attachments.dedupStats() }),
  })
}

// ─── Analytics ────────────────────────────────────────────

export function useCleanupSuggestions(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.analytics.suggestions(accountId!),
    queryFn: () => analyticsApi.getCleanupSuggestions(accountId!),
    enabled: !!accountId,
  })
}

export function useActivityHeatmap(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.analytics.heatmap(accountId!),
    queryFn: () => analyticsApi.getHeatmap(accountId!),
    enabled: !!accountId,
  })
}

export function useInboxZero(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.analytics.inboxZero(accountId!),
    queryFn: () => analyticsApi.getInboxZero(accountId!),
    enabled: !!accountId,
  })
}

export function useDismissSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => analyticsApi.dismissSuggestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics'] }),
  })
}

// ─── Notifications ────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: () => notificationsApi.getPreferences(),
  })
}

/** Optimistic: a switch flips at once and flips back if the server refuses (§6.5). */
export function useUpdateNotificationPreferences() {
  const qc = useQueryClient()
  const queryKey = queryKeys.notifications.preferences()
  return useMutation({
    mutationFn: (prefs: Record<string, boolean | string>) => notificationsApi.updatePreferences(prefs),
    onMutate: async (prefs) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData(queryKey)
      qc.setQueryData(queryKey, (old: object | undefined) => ({ ...old, ...prefs }))
      return { previous }
    },
    onError: (_err, _prefs, context) => qc.setQueryData(queryKey, context?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey }),
  })
}

// ─── Account (/api/auth/me: Gmail accounts, 2FA) ──────────

/** Changes what `/api/auth/me` returns: the auth store refetches it. */
function useMeMutation<T>(fn: (input: T) => Promise<unknown>) {
  return useMutation({ mutationFn: fn, onSuccess: () => useAuthStore.getState().fetchMe() })
}

export const useUpdateGmailAccount = () =>
  useMeMutation(({ id, ...body }: { id: string } & Parameters<typeof gmailAccountsApi.update>[1]) => gmailAccountsApi.update(id, body))
export const useDisconnectGmailAccount = () => useMeMutation(gmailAccountsApi.disconnect)
export const useCreateImapAccount = () => useMeMutation(imapAccountsApi.create)
export const useUpdateImapAccount = () =>
  useMeMutation(({ id, ...body }: { id: string } & Parameters<typeof imapAccountsApi.update>[1]) => imapAccountsApi.update(id, body))
export function useImapFolders(accountId: string) {
  return useQuery({ queryKey: ['imap-folders', accountId], queryFn: () => imapAccountsApi.folders(accountId), staleTime: 0, retry: false })
}
export function useSetImapScope(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scope: ImapScope) => imapAccountsApi.setScope(accountId, scope),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['imap-folders', accountId] }),
  })
}
/** Who an account of one's own is shared with (Paramètres › Comptes). */
export function useAccountShares(accountId: string) {
  return useQuery({ queryKey: ['account-shares', accountId], queryFn: () => accountSharesApi.list(accountId) })
}
export function useAddAccountShare(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => accountSharesApi.add(accountId, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-shares', accountId] }),
  })
}
export function useRemoveAccountShare(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => accountSharesApi.remove(accountId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-shares', accountId] }),
  })
}
/** « Ne plus voir »: leaves an account shared with oneself; it disappears from /me. */
export const useLeaveSharedAccount = () =>
  useMeMutation(({ accountId, userId }: { accountId: string; userId: string }) => accountSharesApi.remove(accountId, userId))

/** « Synchroniser maintenant »: labels read again from Gmail; last_sync_at comes back with /me. */
export const useSyncGmailAccount = () => useMeMutation(labelsApi.sync)

export const useTwoFactorSetup = () => useMutation({ mutationFn: twoFactorApi.setup })
export const useTwoFactorEnable = () => useMeMutation(twoFactorApi.enable)
export const useTwoFactorDisable = () => useMeMutation(twoFactorApi.disable)

/** Settings › À propos; the server re-checks the registry twice a day, so 5 min staleness is plenty. */
export function useAbout() {
  return useQuery({ queryKey: queryKeys.about(), queryFn: aboutApi.get })
}

// ─── Passkeys ─────────────────────────────────────────────

export function usePasskeys() {
  return useQuery({ queryKey: queryKeys.passkeys(), queryFn: passkeysApi.list })
}

/** Options from the server → the browser's passkey dialog → verified and stored under `name`. */
export function useAddPasskey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const response = await startRegistration({ optionsJSON: await passkeysApi.registerOptions() })
      return passkeysApi.registerVerify(name, response)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.passkeys() }),
  })
}

export function useRemovePasskey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: passkeysApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.passkeys() }),
  })
}

// ─── API tokens ───────────────────────────────────────────

export function useApiTokens() {
  return useQuery({ queryKey: queryKeys.apiTokens(), queryFn: apiTokensApi.list })
}

export function useCreateApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: apiTokensApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiTokens() }),
  })
}

export function useRevokeApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: apiTokensApi.revoke,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiTokens() }),
  })
}

export const useChangePassword = () => useMutation({ mutationFn: authApi.changePassword })
export const useExportMyData = () => useMutation({ mutationFn: authApi.exportMyData })
export const useDeleteMe = () => useMutation({ mutationFn: authApi.deleteMe })

export const useExportConfig = () => useMutation({ mutationFn: configApi.exportConfig })
export const useImportConfig = () => useMeMutation(configApi.importConfig)

// ─── Webhooks ─────────────────────────────────────────────

export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.webhooks(),
    queryFn: () => webhooksApi.list(),
  })
}

export const useCreateWebhook = () => useInvalidatingMutation(webhooksApi.create, queryKeys.webhooks())
export const useToggleWebhook = () => useInvalidatingMutation(webhooksApi.toggle, queryKeys.webhooks())
export const useDeleteWebhook = () => useInvalidatingMutation(webhooksApi.remove, queryKeys.webhooks())
export const useTestWebhook = () => useMutation({ mutationFn: webhooksApi.test })

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

export const useRenameSavedSearch = () =>
  useInvalidatingMutation(({ id, name }: { id: string; name: string }) => savedSearchesApi.update(id, { name }), queryKeys.savedSearches())
export const useDeleteSavedSearch = () => useInvalidatingMutation(savedSearchesApi.remove, queryKeys.savedSearches())

// ─── Unified Inbox ────────────────────────────────────────

export function useUnifiedMessages(params: Record<string, any>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.unified(params),
    queryFn: () => unifiedApi.listMessages(params),
    enabled,
  })
}

// ─── Archive Threads ──────────────────────────────────────

export function useArchiveThread(accountId: string | null, threadId: string | null) {
  return useQuery({
    queryKey: queryKeys.archiveThread(accountId!, threadId!),
    queryFn: () => archiveThreadsApi.getThread(accountId!, threadId!),
    enabled: !!accountId && !!threadId,
  })
}

// ─── Retention ────────────────────────────────────────────

export function useRetentionPolicies() {
  return useQuery({
    queryKey: queryKeys.retention(),
    queryFn: () => retentionApi.list(),
  })
}

export function useCreateRetentionPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof retentionApi.create>[0]) =>
      retentionApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.retention() }),
  })
}

export function useUpdateRetentionPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, any>) =>
      retentionApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.retention() }),
  })
}

export function useDeleteRetentionPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => retentionApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.retention() }),
  })
}

export function useRunRetention() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => retentionApi.run(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.retention() }),
  })
}

// ─── Import ───────────────────────────────────────────────

export function useImportMbox(accountId: string) {
  return useMutation({
    mutationFn: (file: File) => importApi.importMbox(accountId, file),
  })
}

export function useImportEml(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) => importApi.importEml(accountId, files),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archive', accountId] }),
  })
}

export function useImportImap(accountId: string) {
  return useMutation({
    mutationFn: (data: Parameters<typeof importApi.importImap>[1]) =>
      importApi.importImap(accountId, data),
  })
}

export function useExportMbox(accountId: string) {
  return useMutation({
    mutationFn: (mailIds?: string[]) => importApi.exportMbox(accountId, mailIds),
  })
}

// ─── Archive Sharing ──────────────────────────────────────

export function useShares() {
  return useQuery({
    queryKey: queryKeys.shares(),
    queryFn: () => sharingApi.list(),
  })
}

export function useCreateShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof sharingApi.create>[0]) =>
      sharingApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shares() }),
  })
}

export function useRevokeShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (shareId: string) => sharingApi.revoke(shareId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shares() }),
  })
}
