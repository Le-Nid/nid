import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Select, Avatar, Dropdown, Typography, Space, Badge } from 'antd'
import {
  DashboardOutlined, MailOutlined, DatabaseOutlined,
  SettingOutlined, LogoutOutlined, UserOutlined, LoadingOutlined
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth.store'

const { Sider, Content, Header } = Layout
const { Text } = Typography

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, gmailAccounts, activeAccountId, setActiveAccount, logout } = useAuthStore()

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/mails', icon: <MailOutlined />, label: 'Mes mails' },
    { key: '/archive', icon: <DatabaseOutlined />, label: 'Archives' },
    { key: '/jobs', icon: <LoadingOutlined />, label: 'Jobs' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Paramètres' },
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: 16 }}>📬 Gmail Manager</Text>
        </div>

        {gmailAccounts.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Compte Gmail</Text>
            <Select
              size="small"
              style={{ width: '100%', marginTop: 4 }}
              value={activeAccountId}
              onChange={setActiveAccount}
              options={gmailAccounts.map((a) => ({ value: a.id, label: a.email }))}
            />
          </div>
        )}

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ border: 'none', paddingTop: 8 }}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}>
          <Dropdown menu={userMenu} trigger={['click']}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} size="small" />
              <Text>{user?.email}</Text>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{ padding: 24, background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
