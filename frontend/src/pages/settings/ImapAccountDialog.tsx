import { useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/app/FormField'
import { useCreateImapAccount, useUpdateImapAccount } from '@/hooks/queries'
import { imapAccountsApi, type ImapDiscovery } from '@/api'
import type { GmailAccount } from '@/store/auth.store'

const inputClass = 'h-11 text-base md:h-9 md:text-sm'

/** Server reason of a refused login (« Invalid credentials »…), else the generic message. */
const serverError = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

/**
 * Adds an IMAP account (archive only), or replaces the server/password of one (`account`, « Action requise »).
 * The server tests the login before saving; nothing is stored when it refuses.
 */
export function ImapAccountDialog({ account, onClose, onCreated }: Readonly<{
  account?: GmailAccount
  onClose: () => void
  onCreated?: (email: string) => void
}>) {
  const { t } = useTranslation()
  const id = useId()
  const create = useCreateImapAccount()
  const update = useUpdateImapAccount()
  const [email, setEmail] = useState(account?.email ?? '')
  const [host, setHost] = useState(account?.imap_host ?? '')
  const [port, setPort] = useState(String(account?.imap_port ?? 993))
  const [secure, setSecure] = useState(account?.imap_secure ?? true)
  const [user, setUser] = useState(account?.imap_user ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Prefilled from the address until the user edits the server fields themselves
  const serverEdited = useRef(!!account)
  const [found, setFound] = useState<ImapDiscovery['source'] | null>(null)
  const pending = create.isPending || update.isPending
  const submitLabel = account ? 'settings.imap.save' : 'settings.imap.connect'

  const discover = () => {
    const address = email.trim()
    if (serverEdited.current || !address.split('@')[1]?.includes('.')) return
    imapAccountsApi.autoconfig(address).then((d) => {
      // The user may have started typing the server while the lookup ran
      if (serverEdited.current) return
      setHost(d.host)
      setPort(String(d.port))
      setSecure(d.secure)
      setFound(d.source)
    }, () => {})
  }
  const editServer = <T,>(set: (v: T) => void) => (v: T) => {
    serverEdited.current = true
    setFound(null)
    set(v)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const settings = { host: host.trim(), port: Number(port), secure, user: user.trim() || email.trim(), password }
    const failed = (err: unknown) => setError(serverError(err, t('settings.imap.failed')))
    if (account) update.mutate({ id: account.id, ...settings }, { onSuccess: onClose, onError: failed })
    else create.mutate({ email: email.trim(), ...settings }, { onSuccess: (res) => onCreated?.((res as { email: string }).email), onError: failed })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(account ? 'settings.imap.updateTitle' : 'settings.imap.addTitle')}</DialogTitle>
          <DialogDescription>{t('settings.imap.description')}</DialogDescription>
        </DialogHeader>
        <form id={id} onSubmit={submit} className="flex flex-col gap-3">
          {!account && (
            <FormField id={`${id}-email`} label={t('settings.imap.email')}>
              <Input id={`${id}-email`} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={discover} className={inputClass} />
            </FormField>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <FormField id={`${id}-host`} label={t('settings.imap.host')}>
              <Input id={`${id}-host`} required placeholder="imap.example.com" value={host} onChange={(e) => editServer(setHost)(e.target.value)} className={inputClass} />
            </FormField>
            <FormField id={`${id}-port`} label={t('settings.imap.port')}>
              <Input id={`${id}-port`} type="number" required min={1} max={65535} value={port} onChange={(e) => editServer(setPort)(e.target.value)} className={inputClass} />
            </FormField>
          </div>
          {found && <p role="status" className="text-sm text-muted-foreground">{t(found === 'guess' ? 'settings.imap.guessed' : 'settings.imap.found')}</p>}
          <label htmlFor={`${id}-secure`} className="flex min-h-11 items-center gap-3 text-sm md:min-h-0">
            <Checkbox id={`${id}-secure`} checked={secure} onCheckedChange={(v) => editServer(setSecure)(v === true)} />
            {t('settings.imap.secure')}
          </label>
          <FormField id={`${id}-user`} label={t('settings.imap.user')}>
            <Input id={`${id}-user`} autoComplete="username" placeholder={t('settings.imap.userPlaceholder')} value={user} onChange={(e) => setUser(e.target.value)} className={inputClass} />
          </FormField>
          <FormField id={`${id}-password`} label={t('settings.imap.password')}>
            <Input id={`${id}-password`} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </FormField>
          <p className="text-sm text-muted-foreground">{t('settings.imap.passwordHint')}</p>
          {error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 md:h-9" disabled={pending} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={id} className="h-11 md:h-9" disabled={pending}>
            {t(pending ? 'settings.imap.testing' : submitLabel)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
