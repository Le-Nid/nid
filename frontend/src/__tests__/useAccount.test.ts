import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAccount } from '../hooks/useAccount'
import { useAuthStore } from '../store/auth.store'

describe('useAccount', () => {
  beforeEach(() => {
    useAuthStore.setState({
      activeAccountId: null,
      gmailAccounts: [],
    })
  })

  it('returns null accountId and account when no accounts', () => {
    const { result } = renderHook(() => useAccount())
    expect(result.current.accountId).toBeNull()
    expect(result.current.account).toBeNull()
  })

  it('returns matching account when activeAccountId is set', () => {
    const accounts = [
      { id: 'acc-1', email: 'a@b.com', is_active: true },
      { id: 'acc-2', email: 'c@d.com', is_active: true },
    ]
    useAuthStore.setState({ activeAccountId: 'acc-2', gmailAccounts: accounts })

    const { result } = renderHook(() => useAccount())
    expect(result.current.accountId).toBe('acc-2')
    expect(result.current.account).toEqual(accounts[1])
  })

  it('returns null account when activeAccountId does not match', () => {
    useAuthStore.setState({
      activeAccountId: 'nonexistent',
      gmailAccounts: [{ id: 'acc-1', email: 'a@b.com', is_active: true }],
    })

    const { result } = renderHook(() => useAccount())
    expect(result.current.accountId).toBe('nonexistent')
    expect(result.current.account).toBeNull()
  })
})
