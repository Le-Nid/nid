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
}

interface GmailAccount {
  id: string
  email: string
  is_active: boolean
}

interface AuthState {
  initialLoading: boolean
  isAuthenticated: boolean
  user: User | null
  gmailAccounts: GmailAccount[]
  activeAccountId: string | null
  storageUsedBytes: number

  login: (email: string, password: string, totpCode?: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  loginWithSsoCode: (code: string) => Promise<void>
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
  loginWithSsoCode: async (code: string) => {
    const { data } = await api.post('/api/auth/google/exchange', { code })
    set({ isAuthenticated: true, user: data })
    await get().fetchMe()
  },

  // Point 13: call server-side logout to blacklist JWT
  logout: async () => {
    try {
      await api.post('/api/auth/logout')
    } catch { /* best-effort */ }
    localStorage.removeItem('activeAccountId')
    set({ isAuthenticated: false, user: null, gmailAccounts: [], activeAccountId: null, storageUsedBytes: 0 })
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get('/api/auth/me')
      const accounts: GmailAccount[] = data.gmailAccounts
      const stored = get().activeAccountId
      const active = stored && accounts.find((a) => a.id === stored) ? stored : accounts[0]?.id ?? null
      if (active) localStorage.setItem('activeAccountId', active)
      set({
        initialLoading: false,
        isAuthenticated: true,
        user: data.user,
        gmailAccounts: accounts,
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
