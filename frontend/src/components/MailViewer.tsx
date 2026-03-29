import { useEffect, useState } from 'react'
import {
  Drawer, Spin, Typography, Space, Tag, Button, Divider,
  Alert, Tooltip, List, Image
} from 'antd'
import { DownloadOutlined, PaperClipOutlined } from '@ant-design/icons'
import { gmailApi } from '../api'
import { formatBytes, formatSender } from '../utils/format'
import dayjs from 'dayjs'

const { Text } = Typography

interface Props {
  accountId: string
  messageId: string | null
  onClose: () => void
}

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
])

function decodeBase64Url(str: string): string {
  try {
    return decodeURIComponent(
      atob(str.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch { return '' }
}

function extractBody(payload: any): { html: string; text: string } {
  let html = '', text = ''
  function walk(part: any) {
    if (!part) return
    const mime = part.mimeType ?? ''
    const data = part.body?.data ?? ''
    if (mime === 'text/html' && data)  html = decodeBase64Url(data)
    else if (mime === 'text/plain' && data) text = decodeBase64Url(data)
    else if (part.parts) part.parts.forEach(walk)
  }
  walk(payload)
  return { html, text }
}

function extractAttachments(payload: any) {
  const result: { filename: string; mimeType: string; size: number; attachmentId: string }[] = []
  function walk(part: any) {
    if (!part) return
    if (part.filename && part.body?.attachmentId) {
      result.push({
        filename:     part.filename,
        mimeType:     part.mimeType ?? 'application/octet-stream',
        size:         part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      })
    }
    if (part.parts) part.parts.forEach(walk)
  }
  walk(payload)
  return result
}

export default function MailViewer({ accountId, messageId, onClose }: Props) {
  const [mail, setMail]       = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  // Cache des blobs d'images préchargées : attachmentId → object URL
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    // Révoquer les anciennes object URLs à chaque nouveau mail
    Object.values(imageUrls).forEach((u) => URL.revokeObjectURL(u))
    setImageUrls({})

    if (!messageId) return
    setLoading(true); setError(null); setMail(null)
    gmailApi.getMessageFull(accountId, messageId)
      .then(setMail)
      .catch(() => setError('Impossible de charger ce mail'))
      .finally(() => setLoading(false))
  }, [accountId, messageId])

  // Précharger les images en base64 → blob URL
  useEffect(() => {
    if (!mail) return
    const atts = extractAttachments(mail.payload)
    const imageAtts = atts.filter((a) => IMAGE_MIME_TYPES.has(a.mimeType))
    if (!imageAtts.length) return

    const token = localStorage.getItem('token')
    imageAtts.forEach(async (att) => {
      try {
        const res = await fetch(
          `/api/gmail/${accountId}/messages/${messageId}/attachments/${att.attachmentId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const json = await res.json()
        const bytes = Uint8Array.from(
          atob(json.data.replace(/-/g, '+').replace(/_/g, '/')),
          (c) => c.charCodeAt(0)
        )
        const blob    = new Blob([bytes], { type: att.mimeType })
        const blobUrl = URL.createObjectURL(blob)
        setImageUrls((prev) => ({ ...prev, [att.attachmentId]: blobUrl }))
      } catch { /* silencieux */ }
    })
  }, [mail])

  const downloadAttachment = async (attachmentId: string, filename: string) => {
    const token = localStorage.getItem('token')
    const res = await fetch(
      `/api/gmail/${accountId}/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const json = await res.json()
    const url  = URL.createObjectURL(
      new Blob([
        Uint8Array.from(atob(json.data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      ])
    )
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const headers     = mail?.payload?.headers ?? []
  const get         = (name: string) =>
    headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
  const { html, text } = mail ? extractBody(mail.payload) : { html: '', text: '' }
  const attachments    = mail ? extractAttachments(mail.payload) : []

  return (
    <Drawer
      title={loading ? 'Chargement…' : (get('Subject') || '(sans sujet)')}
      open={!!messageId}
      onClose={onClose}
      width={740}
      styles={{ body: { padding: 16 } }}
    >
      {error && <Alert type="error" message={error} showIcon />}

      <Spin spinning={loading}>
        {mail && (
          <>
            {/* En-tête */}
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
              <Space wrap>
                {(mail.labelIds ?? []).map((l: string) => (
                  <Tag key={l} style={{ fontSize: 10 }}>{l}</Tag>
                ))}
              </Space>
            </Space>

            <Divider style={{ margin: '8px 0' }} />

            {/* Pièces jointes */}
            {attachments.length > 0 && (
              <>
                <Text strong><PaperClipOutlined /> Pièces jointes ({attachments.length})</Text>

                {/* Preview images inline */}
                {attachments.some((a) => IMAGE_MIME_TYPES.has(a.mimeType)) && (
                  <Image.PreviewGroup>
                    <Space wrap style={{ marginTop: 8, marginBottom: 4 }}>
                      {attachments
                        .filter((a) => IMAGE_MIME_TYPES.has(a.mimeType) && imageUrls[a.attachmentId])
                        .map((a) => (
                          <Image
                            key={a.attachmentId}
                            src={imageUrls[a.attachmentId]}
                            alt={a.filename}
                            width={80}
                            height={80}
                            style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
                          />
                        ))}
                    </Space>
                  </Image.PreviewGroup>
                )}

                {/* Liste complète */}
                <List
                  size="small"
                  dataSource={attachments}
                  renderItem={(att) => (
                    <List.Item
                      actions={[
                        <Tooltip title="Télécharger">
                          <Button
                            size="small" icon={<DownloadOutlined />}
                            onClick={() => downloadAttachment(att.attachmentId, att.filename)}
                          />
                        </Tooltip>,
                      ]}
                    >
                      <Space>
                        {IMAGE_MIME_TYPES.has(att.mimeType) && (
                          <span style={{ fontSize: 14 }}>🖼️</span>
                        )}
                        <Text style={{ fontSize: 12 }}>{att.filename}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{formatBytes(att.size)}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
                <Divider style={{ margin: '8px 0' }} />
              </>
            )}

            {/* Corps du mail */}
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
