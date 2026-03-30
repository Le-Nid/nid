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
  token: string | null
  user: User | null
  gmailAccounts: GmailAccount[]
  activeAccountId: string | null
  storageUsedBytes: number

  login: (email: string, password: string, totpCode?: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  loginWithToken: (token: string, user: User) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  setActiveAccount: (accountId: string) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: null,
  gmailAccounts: [],
  activeAccountId: localStorage.getItem('activeAccountId'),
  storageUsedBytes: 0,

  login: async (email, password, totpCode?) => {
    const { data } = await api.post('/api/auth/login', { email, password, totpCode })
    localStorage.setItem('token', data.token)
    set({ token: data.token, user: data.user })
    await get().fetchMe()
  },

  register: async (email, password) => {
    const { data } = await api.post('/api/auth/register', { email, password })
    localStorage.setItem('token', data.token)
    set({ token: data.token, user: data.user })
  },

  loginWithToken: async (token, user) => {
    localStorage.setItem('token', token)
    set({ token, user })
    await get().fetchMe()
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('activeAccountId')
    set({ token: null, user: null, gmailAccounts: [], activeAccountId: null, storageUsedBytes: 0 })
  },

  fetchMe: async () => {
    const { data } = await api.get('/api/auth/me')
    const accounts: GmailAccount[] = data.gmailAccounts
    const stored = get().activeAccountId
    const active = stored && accounts.find((a) => a.id === stored) ? stored : accounts[0]?.id ?? null
    if (active) localStorage.setItem('activeAccountId', active)
    set({
      user: data.user,
      gmailAccounts: accounts,
      activeAccountId: active,
      storageUsedBytes: data.storageUsedBytes ?? 0,
    })
  },

  setActiveAccount: (accountId) => {
    localStorage.setItem('activeAccountId', accountId)
    set({ activeAccountId: accountId })
  },
}))
