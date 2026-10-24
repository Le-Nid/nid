import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { authApi } from '../api'
import { useThemeStore } from '../store/theme.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/app/FormField'

const field = 'h-11 md:h-9'

/**
 * Public « mot de passe oublié » page. Without `?token`: asks for the e-mail and sends the link (same answer for
 * every address). With the token from the e-mail: sets the new password, then back to /login.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const { mode } = useThemeStore()
  const token = useSearchParams()[0].get('token')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const run = (call: () => Promise<unknown>, failure: string) => {
    setLoading(true)
    setError(null)
    call().then(() => setDone(true), () => setError(failure)).finally(() => setLoading(false))
  }

  const askLink = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim()
    run(() => authApi.forgotPassword(email), t('resetPassword.errorSend'))
  }

  const setPassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== form.get('confirm')) {
      setError(t('settings.password.mismatch'))
      return
    }
    run(() => authApi.resetPassword(token!, password), t('resetPassword.errorLink'))
  }

  let content
  if (done) {
    content = <p role="status" className="text-sm">{token ? t('resetPassword.changed') : t('resetPassword.sent')}</p>
  } else if (token) {
    content = (
      <form onSubmit={setPassword} className="flex flex-col gap-4">
        <FormField id="reset-password" label={t('settings.password.new')}>
          <Input id="reset-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={field} />
        </FormField>
        <FormField id="reset-confirm" label={t('settings.password.confirm')}>
          <Input id="reset-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={field} />
        </FormField>
        {error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className={field} disabled={loading}>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}{t('resetPassword.submit')}
        </Button>
      </form>
    )
  } else {
    content = (
      <form onSubmit={askLink} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('resetPassword.hint')}</p>
        <FormField id="forgot-email" label={t('login.email')}>
          <Input id="forgot-email" name="email" type="email" autoComplete="email" required placeholder={t('login.emailPlaceholder')} className={field} />
        </FormField>
        {error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className={field} disabled={loading}>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}{t('resetPassword.send')}
        </Button>
      </form>
    )
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted px-4 py-8" aria-labelledby="reset-title">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={mode === 'dark' ? '/nid-logo-full-dark.svg' : '/nid-logo-full-light.svg'} alt="Nid" className="h-14 w-auto" />
          <h1 id="reset-title" className="text-lg font-semibold">{t('resetPassword.title')}</h1>
        </div>
        {content}
        <Link to="/login" className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-primary-text underline-offset-4 hover:underline md:min-h-0">
          {t('resetPassword.backToLogin')}
        </Link>
      </div>
    </main>
  )
}
