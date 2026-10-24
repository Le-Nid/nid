import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { SiGoogle, SiDiscord, SiFacebook } from '@icons-pack/react-simple-icons'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { authApi } from '../api'
import api from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { FormField } from '@/components/app/FormField'
import { PageTabs } from '@/components/app/PageTabs'

type Credentials = { email: string; password: string }

// One @, no spaces, a dot inside the domain: a split, not a backtracking regex
function isEmail(value: string) {
  const [local, domain, ...rest] = value.split('@')
  return !rest.length && !!local && !!domain && !/\s/.test(value) && domain.slice(1, -1).includes('.')
}
const field = 'h-11 md:h-9'

function FormError({ message }: Readonly<{ message: string | null }>) {
  if (!message) return null
  return <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{message}</p>
}

/** Email + password form shared by « Connexion » and « Créer un compte »; checks the fields before calling `onSubmit`. */
function CredentialsForm({ id, minLength, passwordPlaceholder, submitLabel, loading, error, onSubmit, children }: Readonly<{
  id: string
  minLength?: number
  passwordPlaceholder: string
  submitLabel: string
  loading: boolean
  error: string | null
  onSubmit: (values: Credentials) => void
  children: React.ReactNode
}>) {
  const { t } = useTranslation()
  const [showPassword, setShowPassword] = useState(false)
  const [invalid, setInvalid] = useState<{ email?: string; password?: string }>({})

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const values = { email: (data.get('email') as string | null ?? '').trim(), password: data.get('password') as string | null ?? '' }
    const errors: { email?: string; password?: string } = {}
    if (!isEmail(values.email)) errors.email = t('login.errorEmail')
    if (!values.password) errors.password = t('login.errorPassword')
    else if (minLength && values.password.length < minLength) errors.password = t('login.errorPasswordMin', { count: minLength })
    setInvalid(errors)
    if (!errors.email && !errors.password) onSubmit(values)
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormField id={`${id}-email`} label={t('login.email')}>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`${id}-email`} name="email" type="email" autoComplete="email" placeholder={t('login.emailPlaceholder')}
            className={`${field} pl-9`} aria-invalid={!!invalid.email} aria-describedby={invalid.email ? `${id}-email-error` : undefined}
          />
        </div>
        {invalid.email && <p id={`${id}-email-error`} role="alert" className="text-sm text-destructive">{invalid.email}</p>}
      </FormField>
      <FormField id={`${id}-password`} label={t('login.password')}>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`${id}-password`} name="password" type={showPassword ? 'text' : 'password'}
            autoComplete={minLength ? 'new-password' : 'current-password'} placeholder={passwordPlaceholder}
            className={`${field} px-9`} aria-invalid={!!invalid.password} aria-describedby={invalid.password ? `${id}-password-error` : undefined}
          />
          <Button
            type="button" variant="ghost" size="icon" className="absolute top-0 right-0 size-11 md:size-9"
            aria-label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')} aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        {invalid.password && <p id={`${id}-password-error`} role="alert" className="text-sm text-destructive">{invalid.password}</p>}
      </FormField>
      <FormError message={error} />
      <Button type="submit" className={field} disabled={loading}>
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
      {children}
    </form>
  )
}

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register, loginWithSsoCode, initialLoading, isAuthenticated } = useAuthStore()
  const { mode } = useThemeStore()
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [totpRequired, setTotpRequired] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [savedCredentials, setSavedCredentials] = useState<Credentials | null>(null)
  // SSO login waiting for the TOTP code (2FA enabled on the account)
  const [pendingSsoCode, setPendingSsoCode] = useState<string | null>(null)
  const [allowRegistration, setAllowRegistration] = useState(true)
  const [socialProviders, setSocialProviders] = useState<string[]>([])
  const [tab, setTab] = useState('login')

  // Session still valid (cookie restored by fetchMe): no need to sign in again, nor to re-enter the TOTP
  useEffect(() => {
    if (!initialLoading && isAuthenticated) navigate('/overview', { replace: true })
  }, [initialLoading])

  useEffect(() => {
    api.get('/api/auth/config').then((r) => {
      setAllowRegistration(r.data.allowRegistration)
      setSocialProviders(r.data.socialProviders ?? [])
    }).catch(() => {})
  }, [])

  // SSO / Social callback — both use the same sso_code pattern
  useEffect(() => {
    const ssoCode = searchParams.get('sso_code')
    const googleError = searchParams.get('google')
    const socialError = searchParams.get('social')

    if (ssoCode) {
      loginWithSsoCode(ssoCode)
        // replace: the one-shot sso_code must not stay in history, going back would replay it and fail
        .then(() => navigate('/overview', { replace: true }))
        .catch((e: unknown) => {
          const axiosErr = e as { response?: { data?: { error?: string } } }
          if (axiosErr.response?.data?.error === 'TOTP_REQUIRED') {
            setPendingSsoCode(ssoCode)
            setTotpRequired(true)
          } else {
            setError(t('login.errorSocial'))
          }
        })
    } else if (googleError === 'disabled' || socialError === 'disabled') {
      setError(t('login.errorDisabled'))
    } else if (googleError === 'error' || socialError === 'error') {
      setError(t('login.errorSocial'))
    }
  }, [searchParams])

  async function handleLogin(values: Credentials) {
    setLoading(true); setError(null)
    try {
      await login(values.email, values.password, totpRequired ? totpCode : undefined)
      navigate('/overview', { replace: true })
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { error?: string } } }
      if (axiosErr.response?.data?.error === 'TOTP_REQUIRED') {
        setTotpRequired(true)
        setSavedCredentials(values)
        setError(null)
      } else {
        setError(axiosErr.response?.data?.error ?? t('login.errorConnection'))
      }
    } finally { setLoading(false) }
  }

  async function handleTotpSubmit() {
    if (!savedCredentials && !pendingSsoCode) return
    setLoading(true); setError(null)
    try {
      if (pendingSsoCode) await loginWithSsoCode(pendingSsoCode, totpCode)
      else if (savedCredentials) await login(savedCredentials.email, savedCredentials.password, totpCode)
      navigate('/overview', { replace: true })
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error ?? t('login.errorTotpInvalid'))
    } finally { setLoading(false) }
  }

  async function handleRegister(values: Credentials) {
    setLoading(true); setError(null)
    try {
      await register(values.email, values.password)
      navigate('/settings/gmail')
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error ?? t('login.errorRegister'))
    } finally { setLoading(false) }
  }

  async function handleSocialLogin(provider: string) {
    setSocialLoading(provider); setError(null)
    try {
      const { url } = await authApi.getSocialAuthUrl(provider)
      globalThis.location.href = url
    } catch {
      setError(t('login.errorSocialStart'))
      setSocialLoading(null)
    }
  }

  const MicrosoftIcon = () => (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 0h11.377v11.377H0zm12.623 0H24v11.377H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z" />
    </svg>
  )

  const LinkedInIcon = () => (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )

  const socialProviderIcons: Record<string, React.ReactNode> = {
    google:    <SiGoogle size={16} />,
    microsoft: <MicrosoftIcon />,
    discord:   <SiDiscord size={16} />,
    facebook:  <SiFacebook size={16} />,
    linkedin:  <LinkedInIcon />,
    keycloak:  <ShieldCheck size={16} />,
  }

  const social = socialProviders.length > 0 && (
    <>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Separator className="flex-1" />{t('common.or')}<Separator className="flex-1" />
      </div>
      {socialProviders.map((provider) => (
        <Button
          key={provider} type="button" variant="outline" className={field}
          disabled={socialLoading === provider} onClick={() => handleSocialLogin(provider)}
        >
          {socialLoading === provider ? <Loader2 className="animate-spin" aria-hidden="true" /> : socialProviderIcons[provider]}
          {t(`login.social_${provider}`)}
        </Button>
      ))}
    </>
  )

  const LoginForm = totpRequired ? (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-lg border bg-muted px-3 py-2 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">{t('login.totpTitle')}</p>
          <p className="text-muted-foreground">{t('login.totpDescription')}</p>
        </div>
      </div>
      <Input
        placeholder={t('login.totpPlaceholder')}
        aria-label={t('login.totpPlaceholder')}
        maxLength={6}
        inputMode="numeric"
        value={totpCode}
        onChange={(e) => setTotpCode(e.target.value)}
        className={field}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleTotpSubmit() }}
        autoComplete="one-time-code"
        autoFocus
      />
      <FormError message={error} />
      <Button className={field} disabled={loading || totpCode.length !== 6} onClick={handleTotpSubmit}>
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {t('login.totpVerify')}
      </Button>
      <Button variant="outline" className={field} onClick={() => { setTotpRequired(false); setSavedCredentials(null); setPendingSsoCode(null); setTotpCode(''); setError(null) }}>
        {t('common.back')}
      </Button>
    </div>
  ) : (
    <CredentialsForm
      id="login" passwordPlaceholder={t('login.passwordPlaceholder')} submitLabel={t('login.submit')}
      loading={loading} error={error} onSubmit={handleLogin}
    >
      {social}
    </CredentialsForm>
  )

  const tabs = [{ key: 'login', label: t('login.tabLogin'), content: LoginForm }]
  if (allowRegistration) {
    tabs.push({
      key: 'register',
      label: t('login.tabRegister'),
      content: (
        <CredentialsForm
          id="register" minLength={8} passwordPlaceholder={t('login.passwordMin')} submitLabel={t('login.register')}
          loading={loading} error={error} onSubmit={handleRegister}
        >
          {social}
        </CredentialsForm>
      ),
    })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted px-4 py-8" aria-label={t('login.tabLogin')}>
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={mode === 'dark' ? '/nid-logo-full-dark.svg' : '/nid-logo-full-light.svg'} alt="Nid" className="h-14 w-auto" />
          <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
        </div>
        <PageTabs value={tab} onChange={setTab} label={t('login.title')} tabs={tabs} />
      </div>
    </main>
  )
}
