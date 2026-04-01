import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'

vi.mocked(localStorage.getItem).mockReturnValue(null)

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      initialLoading: true,
      isAuthenticated: false,
      user: null,
      gmailAccounts: [],
      activeAccountId: null,
      storageUsedBytes: 0,
    })
  })

  describe('login', () => {
    it('calls login endpoint and sets authenticated state', async () => {
      const user = { id: 'u1', email: 'test@test.com', role: 'user' }
      vi.mocked(api.post).mockResolvedValueOnce({ data: { user } })
      // fetchMe call after login
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { user, gmailAccounts: [], storageUsedBytes: 0 },
      })

      await useAuthStore.getState().login('test@test.com', 'password123')

      expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'test@test.com',
        password: 'password123',
        totpCode: undefined,
      })
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().user).toEqual(user)
    })

    it('passes totpCode when provided', async () => {
      const user = { id: 'u1', email: 'test@test.com', role: 'user' }
      vi.mocked(api.post).mockResolvedValueOnce({ data: { user } })
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { user, gmailAccounts: [], storageUsedBytes: 0 },
      })

      await useAuthStore.getState().login('test@test.com', 'password123', '123456')

      expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'test@test.com',
        password: 'password123',
        totpCode: '123456',
      })
    })
  })

  describe('register', () => {
    it('calls register endpoint', async () => {
      const user = { id: 'u2', email: 'new@test.com', role: 'user' }
      vi.mocked(api.post).mockResolvedValueOnce({ data: { user } })

      await useAuthStore.getState().register('new@test.com', 'securepass')

      expect(api.post).toHaveBeenCalledWith('/api/auth/register', {
        email: 'new@test.com',
        password: 'securepass',
      })
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().user).toEqual(user)
    })
  })

  describe('loginWithSsoCode', () => {
    it('exchanges SSO code for session', async () => {
      const user = { id: 'u3', email: 'sso@test.com', role: 'user' }
      vi.mocked(api.post).mockResolvedValueOnce({ data: user })
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { user, gmailAccounts: [], storageUsedBytes: 0 },
      })

      await useAuthStore.getState().loginWithSsoCode('code-abc')

      expect(api.post).toHaveBeenCalledWith('/api/auth/google/exchange', { code: 'code-abc' })
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
  })

  describe('logout', () => {
    it('clears state and calls logout endpoint', async () => {
      useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1', email: 'test@test.com', role: 'user' } })
      vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

      await useAuthStore.getState().logout()

      expect(api.post).toHaveBeenCalledWith('/api/auth/logout')
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().gmailAccounts).toEqual([])
      expect(localStorage.removeItem).toHaveBeenCalledWith('activeAccountId')
    })

    it('clears state even if logout endpoint fails', async () => {
      useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1', email: 'test@test.com', role: 'user' } })
      vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'))

      await useAuthStore.getState().logout()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe('fetchMe', () => {
    it('fetches user and gmail accounts', async () => {
      const user = { id: 'u1', email: 'test@test.com', role: 'user' }
      const accounts = [{ id: 'acc1', email: 'gmail@test.com', is_active: true }]
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { user, gmailAccounts: accounts, storageUsedBytes: 5000 },
      })

      await useAuthStore.getState().fetchMe()

      expect(useAuthStore.getState().initialLoading).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().user).toEqual(user)
      expect(useAuthStore.getState().gmailAccounts).toEqual(accounts)
      expect(useAuthStore.getState().activeAccountId).toBe('acc1')
      expect(useAuthStore.getState().storageUsedBytes).toBe(5000)
    })

    it('uses stored activeAccountId if valid', async () => {
      useAuthStore.setState({ activeAccountId: 'acc2' })
      const accounts = [
        { id: 'acc1', email: 'a@b.com', is_active: true },
        { id: 'acc2', email: 'c@d.com', is_active: true },
      ]
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'test@test.com', role: 'user' }, gmailAccounts: accounts, storageUsedBytes: 0 },
      })

      await useAuthStore.getState().fetchMe()

      expect(useAuthStore.getState().activeAccountId).toBe('acc2')
    })

    it('falls back to first account if stored id is invalid', async () => {
      useAuthStore.setState({ activeAccountId: 'invalid-id' })
      const accounts = [{ id: 'acc1', email: 'a@b.com', is_active: true }]
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'test@test.com', role: 'user' }, gmailAccounts: accounts, storageUsedBytes: 0 },
      })

      await useAuthStore.getState().fetchMe()

      expect(useAuthStore.getState().activeAccountId).toBe('acc1')
    })

    it('sets isAuthenticated to false on error', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Unauthorized'))

      await useAuthStore.getState().fetchMe()

      expect(useAuthStore.getState().initialLoading).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  describe('setActiveAccount', () => {
    it('updates activeAccountId and persists to localStorage', () => {
      useAuthStore.getState().setActiveAccount('acc-99')

      expect(useAuthStore.getState().activeAccountId).toBe('acc-99')
      expect(localStorage.setItem).toHaveBeenCalledWith('activeAccountId', 'acc-99')
    })
  })
})
