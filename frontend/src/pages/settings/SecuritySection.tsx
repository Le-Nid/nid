import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { FormField } from '@/components/app/FormField'
import {
  useAddPasskey, useChangePassword, usePasskeys, useRemovePasskey, useShares, useTwoFactorDisable, useTwoFactorEnable, useTwoFactorSetup,
} from '@/hooks/queries'
import { useAuthStore } from '@/store/auth.store'
import { formatRelative } from '@/utils/format'
import { SettingsCard } from './shared'

/** Server message of a refused request (wrong code…), else the generic one. */
const serverError = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

function CodeForm({ submitLabel, onSubmit, pending, destructive, children }: Readonly<{
  submitLabel: string
  onSubmit: (code: string, reset: () => void) => void
  pending: boolean
  destructive?: boolean
  children?: ReactNode
}>) {
  const { t } = useTranslation()
  const id = useId()
  const [code, setCode] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(code, () => setCode(''))
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormField id={id} label={t('settings.twoFactor.code')}>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="h-11 w-40 text-base md:h-9 md:text-sm"
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={destructive ? 'destructive' : 'default'} className="h-11 md:h-9" disabled={pending || code.length !== 6}>
          {submitLabel}
        </Button>
        {children}
      </div>
    </form>
  )
}

/** 2FA via /api/auth/2fa/*: setup (QR + key) → enable with a code; disable with a code. */
function TwoFactorCard() {
  const { t } = useTranslation()
  const enabled = !!useAuthStore((s) => s.user?.totp_enabled)
  const setup = useTwoFactorSetup()
  const enable = useTwoFactorEnable()
  const disable = useTwoFactorDisable()
  const secret = setup.data as { secret: string; qrDataUrl: string } | undefined

  if (enabled) {
    return (
      <SettingsCard title={t('settings.twoFactor.title')} description={t('settings.twoFactor.enabled')}>
        <CodeForm
          submitLabel={t('settings.twoFactor.disable')}
          destructive
          pending={disable.isPending}
          onSubmit={(code, reset) => disable.mutate(code, {
            onSuccess: () => {
              reset()
              setup.reset()
              toast.success(t('settings.twoFactor.disabled'))
            },
            onError: (err) => toast.error(serverError(err, t('settings.twoFactor.invalid'))),
          })}
        />
      </SettingsCard>
    )
  }

  return (
    <SettingsCard title={t('settings.twoFactor.title')} description={t('settings.twoFactor.hint')}>
      {secret ? (
        <>
          <p className="text-sm">{t('settings.twoFactor.scan')}</p>
          <img src={secret.qrDataUrl} alt={t('settings.twoFactor.qr')} className="size-48 rounded-lg bg-white p-2" />
          <p className="text-sm text-muted-foreground">
            {t('settings.twoFactor.manualKey')} <code className="font-mono break-all text-foreground">{secret.secret}</code>
          </p>
          <CodeForm
            submitLabel={t('settings.twoFactor.verify')}
            pending={enable.isPending}
            onSubmit={(code) => enable.mutate(code, {
              onSuccess: () => toast.success(t('settings.twoFactor.success')),
              onError: (err) => toast.error(serverError(err, t('settings.twoFactor.invalid'))),
            })}
          >
            <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={() => setup.reset()}>{t('common.cancel')}</Button>
          </CodeForm>
        </>
      ) : (
        <Button
          className="h-11 w-fit md:h-9"
          disabled={setup.isPending}
          onClick={() => setup.mutate(undefined, { onError: (err) => toast.error(serverError(err, t('common.error'))) })}
        >
          <ShieldCheck aria-hidden="true" />{t('settings.twoFactor.setup')}
        </Button>
      )}
    </SettingsCard>
  )
}

/** Local accounts only (SSO accounts have no password): the other sessions are signed out. */
function PasswordCard() {
  const { t } = useTranslation()
  const id = useId()
  const change = useChangePassword()
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const value = (name: string) => { const v = form.get(name); return typeof v === 'string' ? v : '' }
    if (value('new') !== value('confirm')) {
      toast.error(t('settings.password.mismatch'))
      return
    }
    change.mutate({ currentPassword: value('current'), newPassword: value('new') }, {
      onSuccess: () => {
        formEl.reset()
        toast.success(t('settings.password.changed'))
      },
      onError: (err) => toast.error(serverError(err, t('common.error'))),
    })
  }
  const input = 'h-11 text-base md:h-9 md:max-w-sm md:text-sm'
  return (
    <SettingsCard title={t('settings.password.title')} description={t('settings.password.hint')}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <FormField id={`${id}-current`} label={t('settings.password.current')}>
          <Input id={`${id}-current`} name="current" type="password" autoComplete="current-password" required className={input} />
        </FormField>
        <FormField id={`${id}-new`} label={t('settings.password.new')}>
          <Input id={`${id}-new`} name="new" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={input} />
        </FormField>
        <FormField id={`${id}-confirm`} label={t('settings.password.confirm')}>
          <Input id={`${id}-confirm`} name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={input} />
        </FormField>
        <Button type="submit" className="h-11 w-fit md:h-9" disabled={change.isPending}>{t('settings.password.submit')}</Button>
      </form>
    </SettingsCard>
  )
}

type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null }

/** Passkeys (WebAuthn): sign in with the device's PIN or biometrics, no password nor TOTP. */
function PasskeysCard() {
  const { t, i18n } = useTranslation()
  const id = useId()
  const passkeys = (usePasskeys().data ?? []) as Passkey[]
  const add = useAddPasskey()
  const remove = useRemovePasskey()
  const [name, setName] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    add.mutate(name.trim(), {
      onSuccess: () => {
        setName('')
        toast.success(t('settings.passkeys.added'))
      },
      // The browser dialog cancelled or refused (NotAllowedError) lands here too
      onError: () => toast.error(t('settings.passkeys.addFailed')),
    })
  }

  return (
    <SettingsCard title={t('settings.passkeys.title')} description={t('settings.passkeys.hint')}>
      {passkeys.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {p.last_used_at
                    ? t('settings.passkeys.lastUsed', { when: formatRelative(p.last_used_at, i18n.language) })
                    : t('settings.passkeys.neverUsed')}
                </span>
              </div>
              <ConfirmDialog
                trigger={(
                  <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={t('settings.passkeys.remove', { name: p.name })}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
                title={t('settings.passkeys.removeTitle', { name: p.name })}
                description={t('settings.passkeys.removeConfirm')}
                confirmLabel={t('settings.passkeys.removeLabel')}
                onConfirm={() => remove.mutate(p.id, { onError: () => toast.error(t('common.error')) })}
                destructive
              />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-end">
        <FormField id={id} label={t('settings.passkeys.name')}>
          <Input id={id} required maxLength={64} placeholder={t('settings.passkeys.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base md:h-9 md:w-64 md:text-sm" />
        </FormField>
        <Button type="submit" className="h-11 w-fit md:h-9" disabled={add.isPending || !name.trim()}>
          <KeyRound aria-hidden="true" />{t('settings.passkeys.add')}
        </Button>
      </form>
    </SettingsCard>
  )
}

/** « Sécurité » (§7.7): password, passkeys, 2FA, and the active share links, managed in Archives (not duplicated here). */
export function SecuritySection() {
  const { t } = useTranslation()
  const shares = useShares().data as unknown[] | undefined
  const hasPassword = !!useAuthStore((s) => s.user?.has_password)
  return (
    <div className="flex flex-col gap-4">
      {hasPassword && <PasswordCard />}
      {browserSupportsWebAuthn() && <PasskeysCard />}
      <TwoFactorCard />
      <SettingsCard
        title={t('settings.shares.title')}
        description={shares ? t('settings.shares.count', { count: shares.length }) : t('settings.shares.description')}
      >
        <Link to="/archives?tab=shares" className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-primary-text underline-offset-4 hover:underline md:min-h-0">
          {t('settings.shares.manage')}
        </Link>
      </SettingsCard>
    </div>
  )
}
