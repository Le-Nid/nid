import { Outlet, useNavigate, useLocation } from 'react-router'
import { Layout, Menu, Select, Avatar, Dropdown, Typography, Switch, Tooltip, Tag, Drawer, Grid } from 'antd'
import {
  LayoutDashboard, Mail, Database, Settings, LogOut, User, CalendarClock, Bot,
  Crown, Ban, Paperclip, LineChart, Copy, Globe, ShieldCheck, Activity,
  PanelLeftClose, PanelLeftOpen, Inbox, LayoutGrid, TrendingUp, SlidersHorizontal,
  FolderOpen, Merge, Server, Clock, Share2, Moon, Sun, MenuIcon,
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { useGlobalJobNotifier } from '../hooks/useGlobalJobNotifier'
import NotificationBell from './NotificationBell'

const { Sider, Content, Header } = Layout
const { Text } = Typography
const { useBreakpoint } = Grid

export default function AppLayout() {
  const { t, i18n } = useTranslation()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user, gmailAccounts, activeAccountId, setActiveAccount, logout } = useAuthStore()
  const { mode, toggle } = useThemeStore()
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const screens = useBreakpoint()
  const isMobile = !screens.md // < 768px

  // Fermer le drawer mobile quand on navigue
  const handleMenuClick = useCallback(({ key }: { key: string }) => {
    navigate(key)
    if (isMobile) setDrawerOpen(false)
  }, [navigate, isMobile])

  // Fermer le drawer si on passe en desktop
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false)
  }, [isMobile])

  // Notifications globales jobs — poll léger, monté une seule fois ici
  useGlobalJobNotifier()

  const menuItems = [
    {
      key: 'grp-email',
      icon: <Inbox size={16} />,
      label: t('nav.group_email'),
      children: [
        { key: '/dashboard', icon: <LayoutDashboard size={16} />, label: t('nav.dashboard') },
        { key: '/mails',     icon: <Mail size={16} />,      label: t('nav.mails') },
        { key: '/unified',   icon: <Merge size={16} />, label: t('nav.unified') },
        { key: '/archive',   icon: <Database size={16} />,  label: t('nav.archives') },
        { key: '/saved-searches', icon: <FolderOpen size={16} />, label: t('nav.savedSearches') },
      ],
    },
    {
      key: 'grp-tools',
      icon: <LayoutGrid size={16} />,
      label: t('nav.group_tools'),
      children: [
        { key: '/rules',        icon: <Bot size={16} />,       label: t('nav.rules') },
        { key: '/unsubscribe',  icon: <Ban size={16} />,        label: t('nav.newsletters') },
        { key: '/attachments',  icon: <Paperclip size={16} />,   label: t('nav.attachments') },
        { key: '/duplicates',   icon: <Copy size={16} />,        label: t('nav.duplicates') },
        { key: '/expiration',   icon: <Clock size={16} />, label: t('nav.expiration') },
        { key: '/sharing',      icon: <Share2 size={16} />,    label: t('nav.sharing') },
      ],
    },
    {
      key: 'grp-analytics',
      icon: <TrendingUp size={16} />,
      label: t('nav.group_analytics'),
      children: [
        { key: '/insights',      icon: <LineChart size={16} />,   label: t('nav.insights') },
        { key: '/analytics',     icon: <Activity size={16} />,     label: t('nav.analytics') },
        { key: '/privacy',       icon: <ShieldCheck size={16} />,      label: t('nav.privacy') },
      ],
    },
    {
      key: 'grp-system',
      icon: <SlidersHorizontal size={16} />,
      label: t('nav.group_system'),
      children: [
        { key: '/jobs',          icon: <CalendarClock size={16} />,    label: t('nav.jobs') },
        { key: '/ops',           icon: <Server size={16} />, label: t('nav.ops') },
        { key: '/settings',      icon: <Settings size={16} />,     label: t('nav.settings') },
        ...(user?.role === 'admin' ? [
          { key: '/admin', icon: <Crown size={16} />, label: t('nav.admin') },
        ] : []),
      ],
    },
  ]

  const userMenu = {
    items: [
      { key: 'email', label: <Text type="secondary">{user?.email}</Text>, disabled: true },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogOut size={16} />, label: t('layout.logout'), danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') { logout().then(() => navigate('/login')) }
    },
  }

  const isDark = mode === 'dark'

  /* ─── Contenu partagé du sidebar (Sider desktop / Drawer mobile) ─── */
  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{
        padding: (!isMobile && collapsed) ? '18px 0' : '18px 16px',
        borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: (!isMobile && collapsed) ? 'center' : 'space-between',
      }} aria-label={t('layout.appName')}>
        {(!isMobile && collapsed)
          ? <img src={isDark ? '/nid-logomark-dark.svg' : '/nid-logomark-light.svg'} alt="Nid" style={{ width: 32, height: 32 }} />
          : <img src={isDark ? '/nid-logo-full-dark.svg' : '/nid-logo-full-light.svg'} alt="Nid" style={{ height: 32 }} />
        }
        {!isMobile && (
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
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* Bouton expand quand collapsed (desktop uniquement) */}
      {!isMobile && collapsed && (
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
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      {/* Sélecteur compte Gmail */}
      {(isMobile || !collapsed) && gmailAccounts.length > 0 && (
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

      <div className="sider-menu-scroll">
        <Menu
          mode="inline"
          theme={isDark ? 'dark' : 'light'}
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['grp-email']}
          inlineCollapsed={!isMobile && collapsed}
          items={menuItems}
          style={{ border: 'none', paddingTop: 8 }}
          onClick={handleMenuClick}
        />
      </div>
    </>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop : Sider fixe */}
      {!isMobile && (
        <Sider
          width={220}
          collapsedWidth={64}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          theme={isDark ? 'dark' : 'light'}
          className="app-sider"
          style={{
            borderRight: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          }}
          role="navigation"
          aria-label={t('layout.mainMenu')}
        >
          {sidebarContent}
        </Sider>
      )}

      {/* Mobile : Drawer glissant */}
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={280}
          styles={{
            body: { padding: 0, background: isDark ? '#141414' : '#fff' },
            header: { display: 'none' },
          }}
          aria-label={t('layout.mainMenu')}
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout>
        <Header className="app-header" style={{
          background:   isDark ? '#141414' : '#fff',
          padding:      isMobile ? '0 12px' : '0 24px',
          borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
          display:      'flex',
          justifyContent: 'flex-end',
          alignItems:   'center',
          gap:          isMobile ? 8 : 16,
        }} role="banner">
          {/* Hamburger menu (mobile) */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t('layout.openMenu')}
              className="mobile-menu-btn"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: isDark ? '#ffffffd9' : '#000000d9',
                marginRight: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                padding: 8,
              }}
            >
              <MenuIcon size={22} />
            </button>
          )}

          {/* Notifications */}
          <NotificationBell />

          {/* Language switcher */}
          <Select
            size="small"
            value={i18n.language?.startsWith('en') ? 'en' : 'fr'}
            onChange={(lng) => i18n.changeLanguage(lng)}
            style={{ width: 90 }}
            suffixIcon={<Globe size={14} />}
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
              checkedChildren={<Moon size={12} />}
              unCheckedChildren={<Sun size={12} />}
              aria-label={isDark ? t('layout.lightMode') : t('layout.darkMode')}
            />
          </Tooltip>

          {/* User menu */}
          <Dropdown menu={userMenu} trigger={['click']}>
            <button type="button" aria-label={t('layout.userMenu')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              {user?.avatar_url
                ? <Avatar src={user.avatar_url} size="small" alt={user.display_name || user.email} crossOrigin="anonymous" />
                : <Avatar icon={<User size={14} />} size="small" aria-hidden="true" />
              }
              {!isMobile && <Text style={{ fontSize: 13 }}>{user?.display_name || user?.email}</Text>}
              {!isMobile && user?.role === 'admin' && <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>admin</Tag>}
            </button>
          </Dropdown>
        </Header>

        <Content id="main-content" style={{
          padding:    isMobile ? 12 : 24,
          background: isDark ? '#1f1f1f' : '#f5f5f5',
          minHeight:  'calc(100vh - 64px)',
        }} role="main">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
