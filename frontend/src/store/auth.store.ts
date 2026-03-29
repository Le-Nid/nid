import { create } from 'zustand'
import api from '../api/client'

interface User {
  id: string
  email: string
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

  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  setActiveAccount: (accountId: string) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: null,
  gmailAccounts: [],
  activeAccountId: localStorage.getItem('activeAccountId'),

  login: async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    set({ token: data.token, user: data.user })
    await get().fetchMe()
  },

  register: async (email, password) => {
    const { data } = await api.post('/api/auth/register', { email, password })
    localStorage.setItem('token', data.token)
    set({ token: data.token, user: data.user })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('activeAccountId')
    set({ token: null, user: null, gmailAccounts: [], activeAccountId: null })
  },

  fetchMe: async () => {
    const { data } = await api.get('/api/auth/me')
    const accounts: GmailAccount[] = data.gmailAccounts
    const stored = get().activeAccountId
    const active = stored && accounts.find((a) => a.id === stored) ? stored : accounts[0]?.id ?? null
    if (active) localStorage.setItem('activeAccountId', active)
    set({ user: data.user, gmailAccounts: accounts, activeAccountId: active })
  },

  setActiveAccount: (accountId) => {
    localStorage.setItem('activeAccountId', accountId)
    set({ activeAccountId: accountId })
  },
}))
