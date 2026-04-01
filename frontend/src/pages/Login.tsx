import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Card, Form, Input, Button, Tabs, Typography, Alert, Space, Divider } from 'antd'
import { MailOutlined, LockOutlined, GoogleOutlined, SafetyOutlined, WindowsOutlined, LinkedinOutlined, FacebookOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { authApi } from '../api'
import api from '../api/client'

const { Title, Text } = Typography

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register, loginWithSsoCode } = useAuthStore()
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
    } catch (e: any) {
      if (e.response?.data?.error === 'TOTP_REQUIRED') {
        setTotpRequired(true)
        setSavedCredentials(values)
        setError(null)
      } else {
        setError(e.response?.data?.error ?? t('login.errorConnection'))
      }
    } finally { setLoading(false) }
  }

  async function handleTotpSubmit() {
    if (!savedCredentials) return
    setLoading(true); setError(null)
    try {
      await login(savedCredentials.email, savedCredentials.password, totpCode)
      navigate('/dashboard')
    } catch (e: any) {
      setError(e.response?.data?.error ?? t('login.errorTotpInvalid'))
    } finally { setLoading(false) }
  }

  async function handleRegister(values: { email: string; password: string }) {
    setLoading(true); setError(null)
    try {
      await register(values.email, values.password)
      navigate('/settings')
    } catch (e: any) {
      setError(e.response?.data?.error ?? t('login.errorRegister'))
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

  const socialProviderIcons: Record<string, React.ReactNode> = {
    google:    <GoogleOutlined />,
    microsoft: <WindowsOutlined />,
    discord:   <span aria-hidden="true" style={{ fontSize: 14 }}>🎮</span>,
    facebook:  <FacebookOutlined />,
    linkedin:  <LinkedinOutlined />,
    keycloak:  <SafetyOutlined />,
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
        icon={<SafetyOutlined />}
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
        <Input prefix={<MailOutlined />} placeholder={t('login.emailPlaceholder')} size="large" />
      </Form.Item>
      <Form.Item name="password" label={t('login.password')} rules={[{ required: true }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder')} size="large" />
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
        <Input prefix={<MailOutlined />} placeholder={t('login.emailPlaceholder')} size="large" />
      </Form.Item>
      <Form.Item name="password" label={t('login.password')} rules={[{ required: true, min: 8 }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordMin')} size="large" />
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
          <Text style={{ fontSize: 32 }} aria-hidden="true">📬</Text>
          <Title level={1} style={{ margin: 0, fontSize: 24 }}>{t('login.title')}</Title>
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
