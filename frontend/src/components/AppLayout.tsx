import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Select, Avatar, Dropdown, Typography, Switch, Tooltip, Tag } from 'antd'
import {
  DashboardOutlined, MailOutlined, DatabaseOutlined, SettingOutlined,
  LogoutOutlined, UserOutlined, ScheduleOutlined, RobotOutlined,
  BulbOutlined, BulbFilled, CrownOutlined,
  StopOutlined, PaperClipOutlined, LineChartOutlined, CopyOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { useGlobalJobNotifier } from '../hooks/useGlobalJobNotifier'
import NotificationBell from './NotificationBell'

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
    { key: '/rules',        icon: <RobotOutlined />,       label: 'Règles auto' },
    { key: '/unsubscribe',   icon: <StopOutlined />,        label: 'Newsletters' },
    { key: '/attachments',   icon: <PaperClipOutlined />,   label: 'Pièces jointes' },
    { key: '/duplicates',    icon: <CopyOutlined />,         label: 'Doublons' },
    { key: '/insights',      icon: <LineChartOutlined />,   label: 'Insights' },
    { key: '/jobs',          icon: <ScheduleOutlined />,    label: 'Jobs' },
    { key: '/settings',  icon: <SettingOutlined />,   label: 'Paramètres' },
    ...(user?.role === 'admin' ? [
      { key: '/admin', icon: <CrownOutlined />, label: 'Administration' },
    ] : []),
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
        role="navigation"
        aria-label="Menu principal"
      >
        {/* Logo */}
        <div style={{
          padding: '18px 16px',
          borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
        }} aria-label="Gmail Manager">
          <Text strong style={{ fontSize: 15 }}><span aria-hidden="true">📬</span> Gmail Manager</Text>
        </div>

        {/* Sélecteur compte Gmail */}
        {gmailAccounts.length > 0 && (
          <div style={{
            padding: '10px 12px',
            borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }} id="gmail-account-label">
              Compte Gmail
            </Text>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={activeAccountId}
              onChange={setActiveAccount}
              options={gmailAccounts.map((a) => ({ value: a.id, label: a.email }))}
              aria-labelledby="gmail-account-label"
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
        }} role="banner">
          {/* Notifications */}
          <NotificationBell />

          {/* Dark mode toggle */}
          <Tooltip title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}>
            <button
              type="button"
              onClick={toggle}
              aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {isDark ? <BulbFilled style={{ color: '#faad14' }} /> : <BulbOutlined />}
              <Switch
                size="small"
                checked={isDark}
                onChange={toggle}
                checkedChildren="🌙"
                unCheckedChildren="☀️"
                tabIndex={-1}
              />
            </button>
          </Tooltip>

          {/* User menu */}
          <Dropdown menu={userMenu} trigger={['click']}>
            <button type="button" aria-label="Menu utilisateur" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              {user?.avatar_url
                ? <Avatar src={user.avatar_url} size="small" alt={user.display_name || user.email} />
                : <Avatar icon={<UserOutlined />} size="small" aria-hidden="true" />
              }
              <Text style={{ fontSize: 13 }}>{user?.display_name || user?.email}</Text>
              {user?.role === 'admin' && <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>admin</Tag>}
            </button>
          </Dropdown>
        </Header>

        <Content id="main-content" style={{
          padding:    24,
          background: isDark ? '#1f1f1f' : '#f5f5f5',
          minHeight:  'calc(100vh - 64px)',
        }} role="main">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
