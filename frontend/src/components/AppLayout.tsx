import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Select, Avatar, Dropdown, Typography, Space, Switch, Tooltip } from 'antd'
import {
  DashboardOutlined, MailOutlined, DatabaseOutlined, SettingOutlined,
  LogoutOutlined, UserOutlined, LoadingOutlined, RobotOutlined,
  BulbOutlined, BulbFilled
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { useGlobalJobNotifier } from '../hooks/useGlobalJobNotifier'

const { Sider, Content, Header } = Layout
const { Text } = Typography

export default function AppLayout() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user, gmailAccounts, activeAccountId, setActiveAccount, logout } = useAuthStore()
  const { mode, toggle } = useThemeStore()

  // Notifications globales jobs — poll léger, monté une seule fois ici
  useGlobalJobNotifier()

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/mails',     icon: <MailOutlined />,      label: 'Mes mails' },
    { key: '/archive',   icon: <DatabaseOutlined />,  label: 'Archives' },
    { key: '/rules',     icon: <RobotOutlined />,     label: 'Règles auto' },
    { key: '/jobs',      icon: <LoadingOutlined />,   label: 'Jobs' },
    { key: '/settings',  icon: <SettingOutlined />,   label: 'Paramètres' },
  ]

  const userMenu = {
    items: [
      { key: 'email', label: <Text type="secondary">{user?.email}</Text>, disabled: true },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Déconnexion', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') { logout(); navigate('/login') }
    },
  }

  const isDark = mode === 'dark'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        theme={isDark ? 'dark' : 'light'}
        style={{ borderRight: isDark ? '1px solid #303030' : '1px solid #f0f0f0' }}
      >
        {/* Logo */}
        <div style={{
          padding: '18px 16px',
          borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
        }}>
          <Text strong style={{ fontSize: 15 }}>📬 Gmail Manager</Text>
        </div>

        {/* Sélecteur compte Gmail */}
        {gmailAccounts.length > 0 && (
          <div style={{
            padding: '10px 12px',
            borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              Compte Gmail
            </Text>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={activeAccountId}
              onChange={setActiveAccount}
              options={gmailAccounts.map((a) => ({ value: a.id, label: a.email }))}
            />
          </div>
        )}

        <Menu
          mode="inline"
          theme={isDark ? 'dark' : 'light'}
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ border: 'none', paddingTop: 8 }}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header style={{
          background:   isDark ? '#141414' : '#fff',
          padding:      '0 24px',
          borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          display:      'flex',
          justifyContent: 'flex-end',
          alignItems:   'center',
          gap:          16,
        }}>
          {/* Dark mode toggle */}
          <Tooltip title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}>
            <Space size={6} style={{ cursor: 'pointer' }} onClick={toggle}>
              {isDark ? <BulbFilled style={{ color: '#faad14' }} /> : <BulbOutlined />}
              <Switch
                size="small"
                checked={isDark}
                onChange={toggle}
                checkedChildren="🌙"
                unCheckedChildren="☀️"
              />
            </Space>
          </Tooltip>

          {/* User menu */}
          <Dropdown menu={userMenu} trigger={['click']}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} size="small" />
              <Text style={{ fontSize: 13 }}>{user?.email}</Text>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{
          padding:    24,
          background: isDark ? '#1f1f1f' : '#f5f5f5',
          minHeight:  'calc(100vh - 64px)',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
