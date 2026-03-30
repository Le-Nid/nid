import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, Button, Tabs, Typography, Alert, Space, Divider } from 'antd'
import { MailOutlined, LockOutlined, GoogleOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/auth.store'
import { authApi } from '../api'

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register, loginWithToken } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle Google SSO callback
  useEffect(() => {
    const token = searchParams.get('token')
    const userParam = searchParams.get('user')
    const googleError = searchParams.get('google')

    if (token && userParam) {
      try {
        const user = JSON.parse(userParam)
        loginWithToken(token, user).then(() => navigate('/dashboard'))
      } catch {
        setError('Erreur lors de la connexion Google')
      }
    } else if (googleError === 'disabled') {
      setError('Ce compte a été désactivé')
    } else if (googleError === 'error') {
      setError('Erreur lors de la connexion Google')
    }
  }, [searchParams])

  async function handleLogin(values: { email: string; password: string }) {
    setLoading(true); setError(null)
    try {
      await login(values.email, values.password)
      navigate('/dashboard')
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Erreur de connexion')
    } finally { setLoading(false) }
  }

  async function handleRegister(values: { email: string; password: string }) {
    setLoading(true); setError(null)
    try {
      await register(values.email, values.password)
      navigate('/settings')
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Erreur lors de la création du compte')
    } finally { setLoading(false) }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true); setError(null)
    try {
      const { url } = await authApi.getGoogleSsoUrl()
      globalThis.location.href = url
    } catch {
      setError('Impossible de lancer la connexion Google')
      setGoogleLoading(false)
    }
  }

  const LoginForm = (
    <Form onFinish={handleLogin} layout="vertical">
      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
        <Input prefix={<MailOutlined />} placeholder="votre@email.com" size="large" />
      </Form.Item>
      <Form.Item name="password" label="Mot de passe" rules={[{ required: true }]}>
        <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" />
      </Form.Item>
      {error && <Alert message={error} type="error" style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" loading={loading} block size="large">
        Se connecter
      </Button>
      <Divider plain>ou</Divider>
      <Button
        block
        size="large"
        icon={<GoogleOutlined />}
        loading={googleLoading}
        onClick={handleGoogleLogin}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        Se connecter avec Google
      </Button>
    </Form>
  )

  const RegisterForm = (
    <Form onFinish={handleRegister} layout="vertical">
      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
        <Input prefix={<MailOutlined />} placeholder="votre@email.com" size="large" />
      </Form.Item>
      <Form.Item name="password" label="Mot de passe" rules={[{ required: true, min: 8 }]}>
        <Input.Password prefix={<LockOutlined />} placeholder="Min. 8 caractères" size="large" />
      </Form.Item>
      {error && <Alert message={error} type="error" style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" loading={loading} block size="large">
        Créer un compte
      </Button>
      <Divider plain>ou</Divider>
      <Button
        block
        size="large"
        icon={<GoogleOutlined />}
        loading={googleLoading}
        onClick={handleGoogleLogin}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        S'inscrire avec Google
      </Button>
    </Form>
  )

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f0f2f5',
    }}>
      <Card style={{ width: 400 }}>
        <Space direction="vertical" align="center" style={{ width: '100%', marginBottom: 24 }}>
          <Text style={{ fontSize: 32 }}>📬</Text>
          <Title level={3} style={{ margin: 0 }}>Gmail Manager</Title>
          <Text type="secondary">Gérez vos mails, archivez sur votre NAS</Text>
        </Space>

        <Tabs
          items={[
            { key: 'login', label: 'Connexion', children: LoginForm },
            { key: 'register', label: 'Créer un compte', children: RegisterForm },
          ]}
        />
      </Card>
    </div>
  )
}
