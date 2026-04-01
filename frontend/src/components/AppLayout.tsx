import { Outlet, useNavigate, useLocation } from 'react-router'
import { Layout, Menu, Select, Avatar, Dropdown, Typography, Switch, Tooltip, Tag } from 'antd'
import {
  DashboardOutlined, MailOutlined, DatabaseOutlined, SettingOutlined,
  LogoutOutlined, UserOutlined, ScheduleOutlined, RobotOutlined,
  CrownOutlined,
  StopOutlined, PaperClipOutlined, LineChartOutlined, CopyOutlined,
  GlobalOutlined, SafetyOutlined, HeatMapOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  InboxOutlined, AppstoreOutlined, FundOutlined, ControlOutlined,
  FolderOpenOutlined, MergeCellsOutlined,
  CloudServerOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { useGlobalJobNotifier } from '../hooks/useGlobalJobNotifier'
import NotificationBell from './NotificationBell'

const { Sider, Content, Header } = Layout
const { Text } = Typography

export default function AppLayout() {
  const { t, i18n } = useTranslation()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user, gmailAccounts, activeAccountId, setActiveAccount, logout } = useAuthStore()
  const { mode, toggle } = useThemeStore()
  const [collapsed, setCollapsed] = useState(false)

  // Notifications globales jobs — poll léger, monté une seule fois ici
  useGlobalJobNotifier()

  const menuItems = [
    {
      key: 'grp-email',
      icon: <InboxOutlined />,
      label: t('nav.group_email'),
      children: [
        { key: '/dashboard', icon: <DashboardOutlined />, label: t('nav.dashboard') },
        { key: '/mails',     icon: <MailOutlined />,      label: t('nav.mails') },
        { key: '/unified',   icon: <MergeCellsOutlined />, label: t('nav.unified') },
        { key: '/archive',   icon: <DatabaseOutlined />,  label: t('nav.archives') },
        { key: '/saved-searches', icon: <FolderOpenOutlined />, label: t('nav.savedSearches') },
      ],
    },
    {
      key: 'grp-tools',
      icon: <AppstoreOutlined />,
      label: t('nav.group_tools'),
      children: [
        { key: '/rules',        icon: <RobotOutlined />,       label: t('nav.rules') },
        { key: '/unsubscribe',  icon: <StopOutlined />,        label: t('nav.newsletters') },
        { key: '/attachments',  icon: <PaperClipOutlined />,   label: t('nav.attachments') },
        { key: '/duplicates',   icon: <CopyOutlined />,        label: t('nav.duplicates') },
      ],
    },
    {
      key: 'grp-analytics',
      icon: <FundOutlined />,
      label: t('nav.group_analytics'),
      children: [
        { key: '/insights',      icon: <LineChartOutlined />,   label: t('nav.insights') },
        { key: '/analytics',     icon: <HeatMapOutlined />,     label: t('nav.analytics') },
        { key: '/privacy',       icon: <SafetyOutlined />,      label: t('nav.privacy') },
      ],
    },
    {
      key: 'grp-system',
      icon: <ControlOutlined />,
      label: t('nav.group_system'),
      children: [
        { key: '/jobs',          icon: <ScheduleOutlined />,    label: t('nav.jobs') },
        { key: '/ops',           icon: <CloudServerOutlined />, label: t('nav.ops') },
        { key: '/settings',      icon: <SettingOutlined />,     label: t('nav.settings') },
        ...(user?.role === 'admin' ? [
          { key: '/admin', icon: <CrownOutlined />, label: t('nav.admin') },
        ] : []),
      ],
    },
  ]

  const userMenu = {
    items: [
      { key: 'email', label: <Text type="secondary">{user?.email}</Text>, disabled: true },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: t('layout.logout'), danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') { logout().then(() => navigate('/login')) }
    },
  }

  const isDark = mode === 'dark'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme={isDark ? 'dark' : 'light'}
        style={{ borderRight: isDark ? '1px solid #303030' : '1px solid #f0f0f0' }}
        role="navigation"
        aria-label={t('layout.mainMenu')}
      >
        {/* Logo + collapse toggle */}
        <div style={{
          padding: collapsed ? '18px 0' : '18px 16px',
          borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
        }} aria-label={t('layout.appName')}>
          {collapsed
            ? <span style={{ fontSize: 18 }} aria-hidden="true">📬</span>
            : <Text strong style={{ fontSize: 15 }}><span aria-hidden="true">📬</span> {t('layout.appName')}</Text>
          }
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('layout.expandMenu') : t('layout.collapseMenu')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: isDark ? '#ffffffa6' : '#00000073',
              fontSize: 16,
              display: collapsed ? 'none' : 'inline-flex',
            }}
          >
            <MenuFoldOutlined />
          </button>
        </div>

        {/* Bouton expand quand collapsed */}
        {collapsed && (
          <div style={{
            textAlign: 'center',
            padding: '8px 0',
            borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          }}>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label={t('layout.expandMenu')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: isDark ? '#ffffffa6' : '#00000073',
                fontSize: 16,
              }}
            >
              <MenuUnfoldOutlined />
            </button>
          </div>
        )}

        {/* Sélecteur compte Gmail (masqué quand collapsed) */}
        {!collapsed && gmailAccounts.length > 0 && (
          <div style={{
            padding: '10px 12px',
            borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }} id="gmail-account-label">
              {t('layout.gmailAccount')}
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
          defaultOpenKeys={['grp-email', 'grp-tools', 'grp-analytics', 'grp-system']}
          inlineCollapsed={collapsed}
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

          {/* Language switcher */}
          <Select
            size="small"
            value={i18n.language?.startsWith('en') ? 'en' : 'fr'}
            onChange={(lng) => i18n.changeLanguage(lng)}
            style={{ width: 90 }}
            suffixIcon={<GlobalOutlined />}
            options={[
              { value: 'fr', label: '🇫🇷 FR' },
              { value: 'en', label: '🇬🇧 EN' },
            ]}
          />

          {/* Dark mode toggle */}
          <Tooltip title={isDark ? t('layout.lightMode') : t('layout.darkMode')}>
            <Switch
              checked={isDark}
              onChange={toggle}
              checkedChildren="🌙"
              unCheckedChildren="☀️"
              aria-label={isDark ? t('layout.lightMode') : t('layout.darkMode')}
            />
          </Tooltip>

          {/* User menu */}
          <Dropdown menu={userMenu} trigger={['click']}>
            <button type="button" aria-label={t('layout.userMenu')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
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
