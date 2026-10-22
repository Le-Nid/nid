import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/app/FormField'
import { useShares, useTwoFactorDisable, useTwoFactorEnable, useTwoFactorSetup } from '@/hooks/queries'
import { useAuthStore } from '@/store/auth.store'
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

/** « Sécurité » (§7.7): 2FA, and the active share links, managed in Archives (not duplicated here). */
export function SecuritySection() {
  const { t } = useTranslation()
  const shares = useShares().data as unknown[] | undefined
  return (
    <div className="flex flex-col gap-4">
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
