import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Archive, Download, HardDriveDownload, ImageOff, Paperclip, Trash2, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { gmailApi } from '@/api'
import { useGmailMessage } from '@/hooks/queries'
import { formatBytes } from '@/utils/format'
import {
  base64UrlToBytes, extractAttachments, extractBody, hasRemoteContent, mailSrcDoc, toBadge,
  type ApiLabel, type Attachment,
} from '@/utils/gmail'
import { LabelBadge } from './LabelBadge'

export type ViewerAction = 'trash' | 'archive' | 'archive_nas'

const ACTIONS: { action: ViewerAction; icon: typeof Trash2 }[] = [
  { action: 'archive', icon: Archive },
  { action: 'archive_nas', icon: HardDriveDownload },
  { action: 'trash', icon: Trash2 },
]

type Header = { name?: string; value?: string }

async function download(accountId: string, messageId: string, att: Attachment) {
  const { data } = await gmailApi.getAttachment(accountId, messageId, att.attachmentId)
  const url = URL.createObjectURL(new Blob([base64UrlToBytes(data) as BlobPart], { type: att.mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = att.filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Body of a mail (I4): sandboxed, no scripts, remote content blocked until « Afficher ». */
function MailBody({ html, text }: Readonly<{ html: string; text: string }>) {
  const { t } = useTranslation()
  const [allowRemote, setAllowRemote] = useState(false)
  if (!html) return <pre className="p-4 font-sans text-[15px] leading-normal whitespace-pre-wrap">{text || t('mails.viewer.empty')}</pre>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!allowRemote && hasRemoteContent(html) && (
        <div className="m-4 mb-0 flex items-center gap-3 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning">
          <ImageOff className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{t('mails.viewer.remoteBlocked')}</span>
          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => setAllowRemote(true)}>{t('mails.viewer.showRemote')}</Button>
        </div>
      )}
      {/* No allow-scripts, no allow-same-origin; popups only so that links open in a new tab */}
      <iframe
        title={t('mails.viewer.body')}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={mailSrcDoc(html, allowRemote)}
        className="min-h-[50dvh] w-full flex-1 bg-white"
      />
    </div>
  )
}

/** Gmail mail reader (§5.2): right sheet ≥md, full screen <md (artboard 4); actions in a bottom toolbar. */
export function MailViewer({ accountId, messageId, labels, onClose, onAction }: Readonly<{
  accountId: string
  messageId: string | null
  labels: ApiLabel[]
  onClose: () => void
  onAction: (action: ViewerAction) => void
}>) {
  const { t, i18n } = useTranslation()
  const { data: mail, isLoading, isError, refetch } = useGmailMessage(accountId, messageId)
  const headers: Header[] = mail?.payload?.headers ?? []
  const header = (name: string) => headers.find((h) => h.name?.toLowerCase() === name)?.value ?? ''
  const { html, text } = extractBody(mail?.payload)
  const attachments = extractAttachments(mail?.payload)
  const date = header('date') && new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(header('date')))

  return (
    <Sheet open={!!messageId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[740px]"
      >
        <div className="flex items-start gap-2 border-b p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <SheetTitle className="text-[21px] leading-tight font-semibold">
              {isLoading ? t('common.loading') : header('subject') || t('mails.noSubject')}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                {mail && (
                  <>
                    <span><span className="font-medium text-foreground">{t('mails.viewer.from')}</span> {header('from')}</span>
                    <span><span className="font-medium text-foreground">{t('mails.viewer.to')}</span> {header('to')}</span>
                    <span>{date} · {formatBytes(mail.sizeEstimate ?? 0)}</span>
                  </>
                )}
              </div>
            </SheetDescription>
            {mail?.labelIds?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {(mail.labelIds as string[]).map((id) => <LabelBadge key={id} label={toBadge(labels, id)} />)}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={t('mails.viewer.close')} onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>

        {isError && (
          <div role="alert" className="m-4 flex items-center gap-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            <span className="flex-1">{t('mails.viewer.loadError')}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{t('mails.retry')}</Button>
          </div>
        )}

        {attachments.length > 0 && (
          <section aria-label={t('mails.viewer.attachments', { count: attachments.length })} className="border-b px-4 py-2">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              <Paperclip className="size-4" aria-hidden="true" />{t('mails.viewer.attachments', { count: attachments.length })}
            </h2>
            <ul className="flex flex-col">
              {attachments.map((att) => (
                <li key={att.attachmentId} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{att.filename}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(att.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-8"
                    aria-label={t('mails.viewer.download', { name: att.filename })}
                    onClick={() => download(accountId, messageId!, att).catch(() => toast.error(t('mails.viewer.downloadFailed')))}
                  >
                    <Download aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* key: a new mail starts with remote content blocked again */}
          {mail && <MailBody key={messageId} html={html} text={text} />}
        </div>

        <div
          role="toolbar"
          aria-label={t('mails.viewer.actions')}
          className="flex border-t px-2 pt-1 pb-[max(8px,env(safe-area-inset-bottom))] md:justify-end md:gap-2 md:p-3"
        >
          {ACTIONS.map(({ action, icon: Icon }) => (
            <Button
              key={action}
              variant="ghost"
              disabled={!mail}
              className={cn('h-auto min-h-[52px] flex-1 flex-col gap-1 px-1 text-xs whitespace-normal md:min-h-9 md:flex-none md:flex-row md:px-3 md:text-sm', action === 'trash' && 'text-destructive')}
              onClick={() => onAction(action)}
            >
              <Icon aria-hidden="true" />{t(`mails.action.${action}`)}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
