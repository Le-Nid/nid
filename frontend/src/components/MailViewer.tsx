import { useEffect, useState } from 'react'
import { Drawer, Spin, Typography, Space, Tag, Button, Divider, Alert, Tooltip, List } from 'antd'
import { DownloadOutlined, PaperClipOutlined, ReloadOutlined } from '@ant-design/icons'
import { gmailApi } from '../api'
import { formatBytes, formatSender } from '../utils/format'
import dayjs from 'dayjs'

const { Text, Title } = Typography

interface Props {
  accountId: string
  messageId: string | null
  onClose: () => void
}

function decodeBase64Url(str: string): string {
  try {
    return decodeURIComponent(
      atob(str.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    return ''
  }
}

function extractBody(payload: any): { html: string; text: string } {
  let html = ''
  let text = ''

  function walk(part: any) {
    if (!part) return
    const mime = part.mimeType ?? ''
    const data = part.body?.data ?? ''

    if (mime === 'text/html' && data) html = decodeBase64Url(data)
    else if (mime === 'text/plain' && data) text = decodeBase64Url(data)
    else if (part.parts) part.parts.forEach(walk)
  }
  walk(payload)
  return { html, text }
}

function extractAttachments(payload: any): { filename: string; mimeType: string; size: number; attachmentId: string }[] {
  const result: any[] = []
  function walk(part: any) {
    if (!part) return
    if (part.filename && part.body?.attachmentId) {
      result.push({
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      })
    }
    if (part.parts) part.parts.forEach(walk)
  }
  walk(payload)
  return result
}

export default function MailViewer({ accountId, messageId, onClose }: Props) {
  const [mail, setMail] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!messageId) return
    setLoading(true); setError(null); setMail(null)
    gmailApi.getMessageFull(accountId, messageId)
      .then(setMail)
      .catch(() => setError('Impossible de charger ce mail'))
      .finally(() => setLoading(false))
  }, [accountId, messageId])

  const headers = mail?.payload?.headers ?? []
  const get = (name: string) =>
    headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

  const { html, text } = mail ? extractBody(mail.payload) : { html: '', text: '' }
  const attachments = mail ? extractAttachments(mail.payload) : []

  const downloadAttachment = async (attachmentId: string, filename: string) => {
    const res = await fetch(
      `/api/gmail/${accountId}/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
    )
    const blob = await res.json()
    const url = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(blob.data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))])
    )
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Drawer
      title={
        loading ? 'Chargement…' : (
          <Text ellipsis style={{ maxWidth: 500 }}>
            {get('Subject') || '(sans sujet)'}
          </Text>
        )
      }
      open={!!messageId}
      onClose={onClose}
      width={720}
      styles={{ body: { padding: 16 } }}
    >
      {error && <Alert type="error" message={error} showIcon />}

      <Spin spinning={loading}>
        {mail && (
          <>
            {/* Header */}
            <Space direction="vertical" size={2} style={{ marginBottom: 12, width: '100%' }}>
              <Space wrap>
                <Text strong>De :</Text>
                <Text>{get('From')}</Text>
              </Space>
              <Space wrap>
                <Text strong>À :</Text>
                <Text type="secondary">{get('To')}</Text>
              </Space>
              <Space>
                <Text strong>Date :</Text>
                <Text type="secondary">{dayjs(get('Date')).format('DD/MM/YYYY HH:mm')}</Text>
                <Text type="secondary">·</Text>
                <Text type="secondary">{formatBytes(mail.sizeEstimate ?? 0)}</Text>
              </Space>
              {(mail.labelIds ?? []).map((l: string) => (
                <Tag key={l} size="small">{l}</Tag>
              ))}
            </Space>

            <Divider style={{ margin: '8px 0' }} />

            {/* Pièces jointes */}
            {attachments.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text strong><PaperClipOutlined /> Pièces jointes ({attachments.length})</Text>
                <List
                  size="small"
                  dataSource={attachments}
                  renderItem={(att) => (
                    <List.Item
                      actions={[
                        <Tooltip title="Télécharger">
                          <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => downloadAttachment(att.attachmentId, att.filename)}
                          />
                        </Tooltip>,
                      ]}
                    >
                      <Text style={{ fontSize: 12 }}>{att.filename}</Text>
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                        {formatBytes(att.size)}
                      </Text>
                    </List.Item>
                  )}
                />
                <Divider style={{ margin: '8px 0' }} />
              </div>
            )}

            {/* Corps */}
            {html ? (
              <iframe
                srcDoc={html}
                style={{ width: '100%', minHeight: 500, border: 'none', borderRadius: 4 }}
                sandbox="allow-same-origin"
                title="mail-content"
              />
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: 'inherit' }}>
                {text || '(Corps vide)'}
              </pre>
            )}
          </>
        )}
      </Spin>
    </Drawer>
  )
}
