import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Card, Form, Input, Button, Tabs, Typography, Alert, Space, Divider } from 'antd'
import { Mail, Lock, ShieldCheck } from 'lucide-react'
import { SiGoogle, SiDiscord, SiFacebook } from '@icons-pack/react-simple-icons'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { authApi } from '../api'
import api from '../api/client'

const { Text } = Typography

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register, loginWithSsoCode } = useAuthStore()
  const { mode } = useThemeStore()
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [totpRequired, setTotpRequired] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [savedCredentials, setSavedCredentials] = useState<{ email: string; password: string } | null>(null)
  const [allowRegistration, setAllowRegistration] = useState(true)
  const [socialProviders, setSocialProviders] = useState<string[]>([])

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
        .then(() => navigate('/dashboard'))
        .catch(() => setError(t('login.errorSocial')))
    } else if (googleError === 'disabled' || socialError === 'disabled') {
      setError(t('login.errorDisabled'))
    } else if (googleError === 'error' || socialError === 'error') {
      setError(t('login.errorSocial'))
    }
  }, [searchParams])

  async function handleLogin(values: { email: string; password: string }) {
    setLoading(true); setError(null)
    try {
      await login(values.email, values.password, totpRequired ? totpCode : undefined)
      navigate('/dashboard')
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
    if (!savedCredentials) return
    setLoading(true); setError(null)
    try {
      await login(savedCredentials.email, savedCredentials.password, totpCode)
      navigate('/dashboard')
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error ?? t('login.errorTotpInvalid'))
    } finally { setLoading(false) }
  }

  async function handleRegister(values: { email: string; password: string }) {
    setLoading(true); setError(null)
    try {
      await register(values.email, values.password)
      navigate('/settings')
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 0h11.377v11.377H0zm12.623 0H24v11.377H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z" />
    </svg>
  )

  const LinkedInIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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

  const socialButtons = socialProviders.map((provider) => (
    <Button
      key={provider}
      block
      size="large"
      icon={socialProviderIcons[provider]}
      loading={socialLoading === provider}
      onClick={() => handleSocialLogin(provider)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}
    >
      {t(`login.social_${provider}`)}
    </Button>
  ))

  const LoginForm = totpRequired ? (
    <div>
      <Alert
        message={t('login.totpTitle')}
        description={t('login.totpDescription')}
        type="info"
        showIcon
        icon={<ShieldCheck size={16} />}
        style={{ marginBottom: 16 }}
      />
      <Input
        placeholder={t('login.totpPlaceholder')}
        aria-label={t('login.totpPlaceholder')}
        maxLength={6}
        value={totpCode}
        onChange={(e) => setTotpCode(e.target.value)}
        size="large"
        style={{ marginBottom: 16 }}
        onPressEnter={handleTotpSubmit}
        autoComplete="one-time-code"
      />
      {error && <Alert title={error} type="error" style={{ marginBottom: 16 }} />}
      <Button type="primary" loading={loading} block size="large" onClick={handleTotpSubmit} disabled={totpCode.length !== 6}>
        {t('login.totpVerify')}
      </Button>
      <Button block size="large" style={{ marginTop: 8 }} onClick={() => { setTotpRequired(false); setSavedCredentials(null); setTotpCode(''); setError(null) }}>
        {t('common.back')}
      </Button>
    </div>
  ) : (
    <Form onFinish={handleLogin} layout="vertical">
      <Form.Item name="email" label={t('login.email')} rules={[{ required: true, type: 'email' }]}>
        <Input prefix={<Mail size={16} />} placeholder={t('login.emailPlaceholder')} size="large" />
      </Form.Item>
      <Form.Item name="password" label={t('login.password')} rules={[{ required: true }]}>
        <Input.Password prefix={<Lock size={16} />} placeholder={t('login.passwordPlaceholder')} size="large" />
      </Form.Item>
      {error && <Alert title={error} type="error" style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" loading={loading} block size="large">
        {t('login.submit')}
      </Button>
      {socialProviders.length > 0 && <Divider plain>{t('common.or')}</Divider>}
      {socialButtons}
    </Form>
  )

  const RegisterForm = (
    <Form onFinish={handleRegister} layout="vertical">
      <Form.Item name="email" label={t('login.email')} rules={[{ required: true, type: 'email' }]}>
        <Input prefix={<Mail size={16} />} placeholder={t('login.emailPlaceholder')} size="large" />
      </Form.Item>
      <Form.Item name="password" label={t('login.password')} rules={[{ required: true, min: 8 }]}>
        <Input.Password prefix={<Lock size={16} />} placeholder={t('login.passwordMin')} size="large" />
      </Form.Item>
      {error && <Alert title={error} type="error" style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" loading={loading} block size="large">
        {t('login.register')}
      </Button>
      {socialProviders.length > 0 && <Divider plain>{t('common.or')}</Divider>}
      {socialButtons}
    </Form>
  )

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f0f2f5',
    }} aria-label={t('login.tabLogin')}>
      <Card style={{ width: 400 }}>
        <Space orientation="vertical" align="center" style={{ width: '100%', marginBottom: 24 }}>
          <img src={mode === 'dark' ? '/nid-logo-full-dark.svg' : '/nid-logo-full-light.svg'} alt="Nid" style={{ height: 56 }} />
          <Text type="secondary">{t('login.subtitle')}</Text>
        </Space>

        <Tabs
          items={[
            { key: 'login', label: t('login.tabLogin'), children: LoginForm },
            ...(allowRegistration ? [{ key: 'register', label: t('login.tabRegister'), children: RegisterForm }] : []),
          ]}
        />
      </Card>
    </main>
  )
}
