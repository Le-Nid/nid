import { useAuthStore } from '../store/auth.store'

export function useAccount() {
  const { activeAccountId, gmailAccounts } = useAuthStore()
  const account = gmailAccounts.find((a) => a.id === activeAccountId) ?? null
  return { accountId: activeAccountId, account }
}
