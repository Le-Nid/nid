import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Card, Typography, Spin, Result, Tag, Space } from 'antd'
import { MailOutlined, UserOutlined, CalendarOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { sharingApi } from '../api'

const { Title, Text } = Typography

export default function SharedMailPage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [mail, setMail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    sharingApi.getPublic(token)
      .then(setMail)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !mail) {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <Result
          status="404"
          title={t('sharing.notFound')}
          subTitle={t('sharing.notFoundDesc')}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
      <Card>
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Title level={3}>
            <MailOutlined style={{ marginRight: 8 }} />
            {mail.subject || t('common.noSubject')}
          </Title>

          <Space wrap>
            <Tag icon={<UserOutlined />}>{mail.sender}</Tag>
            {mail.recipient && <Tag>{t('sharing.to')}: {mail.recipient}</Tag>}
            {mail.date && (
              <Tag icon={<CalendarOutlined />}>
                {dayjs(mail.date).format('DD/MM/YYYY HH:mm')}
              </Tag>
            )}
          </Space>

          <Tag color="orange">{t('sharing.sharedLink')}</Tag>

          {mail.htmlBody ? (
            <iframe
              srcDoc={mail.htmlBody}
              sandbox="allow-same-origin"
              style={{
                width: '100%',
                minHeight: 400,
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                background: '#fff',
              }}
              title={t('sharing.emailContent')}
            />
          ) : mail.textBody ? (
            <Card
              size="small"
              style={{ background: '#fafafa', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
            >
              {mail.textBody}
            </Card>
          ) : (
            <Text type="secondary">{t('sharing.noContent')}</Text>
          )}
        </Space>
      </Card>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('sharing.poweredBy')}
        </Text>
      </div>
    </div>
  )
}
