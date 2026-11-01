import type { TFunction } from 'i18next'
import { useAuthStore, type GmailAccount } from '../store/auth.store'

export function useAccount() {
  const { activeAccountId, gmailAccounts, sharedAccounts } = useAuthStore()
  const account = [...gmailAccounts, ...sharedAccounts].find((a) => a.id === activeAccountId) ?? null
  return { accountId: activeAccountId, account }
}

/** An account in the account switchers: its address, marked when disconnected or shared by someone else. */
export function accountLabel(a: GmailAccount, t: TFunction) {
  if (a.shared_by) return t('settings.share.option', { email: a.email, owner: a.shared_by })
  return a.is_active ? a.email : t('settings.gmail.disconnectedOption', { email: a.email })
}
