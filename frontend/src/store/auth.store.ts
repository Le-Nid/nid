import { create } from 'zustand'
import api from '../api/client'

interface User {
  id: string
  email: string
  role: string
  display_name?: string | null
  avatar_url?: string | null
  max_gmail_accounts?: number
  storage_quota_bytes?: number
  totp_enabled?: boolean
  /** Local account with a password (false: SSO only). */
  has_password?: boolean
}

export interface GmailAccount {
  id: string
  email: string
  is_active: boolean
  backup_enabled?: boolean
  backup_interval?: '1h' | '6h' | '24h'
  /** « Action requise »: Google (or the IMAP server) refused the credentials, the account must be reconnected. */
  needs_reauth?: boolean
  last_sync_at?: string | null
  /** IMAP accounts are archived only: Mails, Nettoyage and Règles need Gmail. */
  provider?: 'gmail' | 'imap'
  imap_host?: string | null
  imap_port?: number | null
  imap_secure?: boolean | null
  imap_user?: string | null
  /** Shared read-only by another Nid user (their email): only its archive can be read. */
  shared_by?: string
}

interface AuthState {
  initialLoading: boolean
  isAuthenticated: boolean
  user: User | null
  gmailAccounts: GmailAccount[]
  /** Accounts other users share with this one, read-only (archive only). */
  sharedAccounts: GmailAccount[]
  activeAccountId: string | null
  storageUsedBytes: number

  login: (email: string, password: string, totpCode?: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  loginWithSsoCode: (code: string, totpCode?: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  setActiveAccount: (accountId: string) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Point 1: no more token in localStorage — auth state determined by cookie presence
  initialLoading: true,
  isAuthenticated: false,
  user: null,
  gmailAccounts: [],
  sharedAccounts: [],
  activeAccountId: localStorage.getItem('activeAccountId'),
  storageUsedBytes: 0,

  login: async (email, password, totpCode?) => {
    const { data } = await api.post('/api/auth/login', { email, password, totpCode })
    // Token is now set as httpOnly cookie by the backend
    set({ isAuthenticated: true, user: data.user })
    await get().fetchMe()
  },

  register: async (email, password) => {
    const { data } = await api.post('/api/auth/register', { email, password })
    set({ isAuthenticated: true, user: data.user })
  },

  // Point 3: SSO now uses an auth code exchange instead of token in URL
  loginWithSsoCode: async (code: string, totpCode?: string) => {
    const { data } = await api.post('/api/auth/google/exchange', { code, totpCode })
    set({ isAuthenticated: true, user: data })
    await get().fetchMe()
  },

  // Point 13: call server-side logout to blacklist JWT
  logout: async () => {
    try {
      await api.post('/api/auth/logout')
    } catch { /* best-effort */ }
    localStorage.removeItem('activeAccountId')
    set({ isAuthenticated: false, user: null, gmailAccounts: [], sharedAccounts: [], activeAccountId: null, storageUsedBytes: 0 })
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get('/api/auth/me')
      const accounts: GmailAccount[] = data.gmailAccounts
      const shared: GmailAccount[] = (data.sharedAccounts ?? []).map((a: GmailAccount) => ({ ...a, is_active: true }))
      const stored = get().activeAccountId
      // Default to a connected account of one's own: a disconnected or shared one only shows its archives
      const known = [...accounts, ...shared].some((a) => a.id === stored)
      const active = stored && known ? stored : (accounts.find((a) => a.is_active) ?? accounts[0] ?? shared[0])?.id ?? null
      if (active) localStorage.setItem('activeAccountId', active)
      set({
        initialLoading: false,
        isAuthenticated: true,
        user: data.user,
        gmailAccounts: accounts,
        sharedAccounts: shared,
        activeAccountId: active,
        storageUsedBytes: data.storageUsedBytes ?? 0,
      })
    } catch {
      set({ initialLoading: false, isAuthenticated: false, user: null })
    }
  },

  setActiveAccount: (accountId) => {
    localStorage.setItem('activeAccountId', accountId)
    set({ activeAccountId: accountId })
  },
}))
