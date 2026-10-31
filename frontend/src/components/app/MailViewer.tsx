import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Archive, Download, HardDriveDownload, ImageOff, MailPlus, Paperclip, Share2, Trash2, X, Zap } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { archiveApi, gmailApi } from '@/api'
import { useArchiveMail, useArchiveThread, useGmailMessage, useNotificationPreferences } from '@/hooks/queries'
import { saveBlob, saveFile } from '@/utils/download'
import { formatBytes, formatEmail, formatSender } from '@/utils/format'
import {
  base64UrlToBytes, extractAttachments, extractBody, hasRemoteContent, mailSrcDoc, toBadge,
  type ApiLabel,
} from '@/utils/gmail'
import { ArchiveTagEditor } from './ArchiveTags'
import { LabelBadge } from './LabelBadge'

export type ViewerAction = 'trash' | 'archive' | 'archive_nas'
export type ArchiveViewerAction = 'share' | 'restore' | 'trash'

const ACTIONS = {
  gmail: [
    { action: 'archive', icon: Archive },
    { action: 'archive_nas', icon: HardDriveDownload },
    { action: 'trash', icon: Trash2 },
  ],
  archive: [
    { action: 'share', icon: Share2 },
    { action: 'restore', icon: MailPlus },
    { action: 'trash', icon: Trash2 },
  ],
} as const

type Header = { name?: string; value?: string }
type ViewerAttachment = { id: string; filename: string; size: number; save: () => Promise<void> }
/** What the reader shows, from a Gmail message or an archived EML. */
type ViewerMail = {
  subject: string; from: string; to: string; date: string; size: number; labelIds: string[]
  html: string; text: string; attachments: ViewerAttachment[]; threadId: string | null; tags?: string[]
}
type ArchivedDetail = {
  subject: string | null; sender: string | null; recipient: string | null; date: string | null; size_bytes: number | string
  label_ids: string[] | null; tags?: string[]; html: string; text: string; is_encrypted?: boolean; thread_id: string | null
  attachments?: { id: string; filename: string; size_bytes: number | string }[]
}
type ThreadMail = { id: string; sender: string | null; date: string | null }

// Toolbar buttons: icon over text, 52 px tall <md; inline ≥md
const TOOL = 'h-auto min-h-[52px] flex-1 flex-col gap-1 px-1 text-xs whitespace-normal md:min-h-9 md:flex-none md:flex-row md:px-3 md:text-sm'

function fromGmail(accountId: string, messageId: string, mail: any): ViewerMail {
  const headers: Header[] = mail.payload?.headers ?? []
  const header = (name: string) => headers.find((h) => h.name?.toLowerCase() === name)?.value ?? ''
  return {
    subject: header('subject'), from: header('from'), to: header('to'), date: header('date'), size: mail.sizeEstimate ?? 0,
    labelIds: mail.labelIds ?? [], ...extractBody(mail.payload), threadId: null,
    attachments: extractAttachments(mail.payload).map((att) => ({
      id: att.attachmentId, filename: att.filename, size: att.size,
      save: async () => {
        const { data } = await gmailApi.getAttachment(accountId, messageId, att.attachmentId)
        saveBlob(new Blob([base64UrlToBytes(data) as BlobPart], { type: att.mimeType }), att.filename)
      },
    })),
  }
}

function fromArchive(accountId: string, mail: ArchivedDetail, encryptedText: string): ViewerMail {
  return {
    subject: mail.subject ?? '', from: mail.sender ?? '', to: mail.recipient ?? '', date: mail.date ?? '', size: Number(mail.size_bytes),
    labelIds: mail.label_ids ?? [], html: mail.html, text: mail.is_encrypted ? encryptedText : mail.text, threadId: mail.thread_id, tags: mail.tags ?? [],
    attachments: (mail.attachments ?? []).map((att) => ({
      id: att.id, filename: att.filename, size: Number(att.size_bytes),
      save: () => Promise.resolve(saveFile(archiveApi.downloadAttachment(accountId, att.id), att.filename)),
    })),
  }
}

/** The mail of either source; only the matching query runs. */
function useViewerMail(source: 'gmail' | 'archive', accountId: string, messageId: string | null) {
  const { t } = useTranslation()
  const gmail = useGmailMessage(accountId, source === 'gmail' ? messageId : null)
  const archived = useArchiveMail(accountId, source === 'archive' ? messageId : null)
  const query = source === 'archive' ? archived : gmail
  let mail: ViewerMail | undefined
  if (query.data && messageId) mail = source === 'archive' ? fromArchive(accountId, query.data, t('archives.encryptedBody')) : fromGmail(accountId, messageId, query.data)
  return { mail, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch }
}

/** Body of a mail (I4): sandboxed, no scripts, remote content blocked until « Afficher » unless the user allows it (B10). */
function MailBody({ html, text }: Readonly<{ html: string; text: string }>) {
  // Blocked while the preference loads or when it cannot be read: never show more than the user asked for
  const allowedByPref = useNotificationPreferences().data?.remote_images === 'allow'
  return <MailFrame html={html} text={text} allowedByPref={allowedByPref} />
}

/** Same sandboxed body without the user preference: the public shared page (`/shared/:token`) has no session to read it. */
export function MailFrame({ html, text, allowedByPref = false }: Readonly<{ html: string; text: string; allowedByPref?: boolean }>) {
  const { t } = useTranslation()
  const [shown, setAllowRemote] = useState(false)
  const allowRemote = shown || allowedByPref
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

/** Other messages of an archived conversation; the reader switches to the one picked. */
function ThreadList({ accountId, threadId, current, onOpen }: Readonly<{
  accountId: string
  threadId: string | null
  current: string
  onOpen: (id: string) => void
}>) {
  const { t, i18n } = useTranslation()
  const mails: ThreadMail[] = useArchiveThread(accountId, threadId).data ?? []
  if (mails.length < 2) return null
  const title = t('mails.viewer.thread', { count: mails.length })
  return (
    <section aria-label={title} className="border-b px-4 py-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="flex flex-col">
        {mails.map((m) => (
          <li key={m.id}>
            <Button
              variant="ghost"
              aria-current={m.id === current || undefined}
              className="h-11 w-full justify-start gap-2 px-2 font-normal aria-[current]:font-semibold md:h-8"
              onClick={() => onOpen(m.id)}
            >
              <span className="min-w-0 flex-1 truncate text-left">{formatSender(m.sender ?? '')}</span>
              <span className="text-xs text-muted-foreground">
                {m.date && new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(m.date))}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

type ViewerProps = {
  accountId: string
  messageId: string | null
  labels: ApiLabel[]
  onClose: () => void
  /** « Créer une règle » for the sender's address (I3). */
  onCreateRule?: (from: string) => void
} & (
  | { source?: 'gmail'; onAction: (action: ViewerAction) => void; onOpenMail?: never }
  /** Archived EML (§7.5): Partager / Supprimer, and the other messages of its thread. */
  | { source: 'archive'; onAction: (action: ArchiveViewerAction) => void; onOpenMail: (id: string) => void; canRestore?: boolean; readOnly?: boolean }
)

/** Mail reader (§5.2), Gmail or archive: right sheet ≥md, full screen <md (artboard 4); actions in a bottom toolbar. */
export function MailViewer(props: Readonly<ViewerProps>) {
  const { accountId, messageId, labels, onClose, onCreateRule, source = 'gmail' } = props
  const { t, i18n } = useTranslation()
  const { mail, isLoading, isError, refetch } = useViewerMail(source, accountId, messageId)
  const attachments = mail?.attachments ?? []
  const date = mail?.date && new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(mail.date))
  const onAction = props.onAction as (action: string) => void

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
              {isLoading ? t('common.loading') : mail?.subject || t('mails.noSubject')}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                {mail && (
                  <>
                    <span><span className="font-medium text-foreground">{t('mails.viewer.from')}</span> {mail.from}</span>
                    <span><span className="font-medium text-foreground">{t('mails.viewer.to')}</span> {mail.to}</span>
                    <span>{date} · {formatBytes(mail.size)}</span>
                  </>
                )}
              </div>
            </SheetDescription>
            {!!mail?.labelIds.length && (
              <div className="flex flex-wrap gap-1 pt-1">
                {mail.labelIds.map((id) => <LabelBadge key={id} label={toBadge(labels, id)} />)}
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

        {props.source === 'archive' && mail && messageId && (
          <ArchiveTagEditor accountId={accountId} mailId={messageId} tags={mail.tags ?? []} readOnly={props.readOnly} />
        )}

        {props.source === 'archive' && mail && messageId && (
          <ThreadList accountId={accountId} threadId={mail.threadId} current={messageId} onOpen={props.onOpenMail} />
        )}

        {attachments.length > 0 && (
          <section aria-label={t('mails.viewer.attachments', { count: attachments.length })} className="border-b px-4 py-2">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              <Paperclip className="size-4" aria-hidden="true" />{t('mails.viewer.attachments', { count: attachments.length })}
            </h2>
            <ul className="flex flex-col">
              {attachments.map((att) => (
                <li key={att.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{att.filename}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(att.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-8"
                    aria-label={t('mails.viewer.download', { name: att.filename })}
                    onClick={() => att.save().catch(() => toast.error(t('mails.viewer.downloadFailed')))}
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
          {mail && <MailBody key={messageId} html={mail.html} text={mail.text} />}
        </div>

        <div
          role="toolbar"
          aria-label={t('mails.viewer.actions')}
          className="flex border-t px-2 pt-1 pb-[max(8px,env(safe-area-inset-bottom))] md:justify-end md:gap-2 md:p-3"
        >
          {ACTIONS[source].filter(({ action }) => props.source !== 'archive' || (!props.readOnly && (action !== 'restore' || props.canRestore))).map(({ action, icon: Icon }) => (
            <Button
              key={action}
              variant="ghost"
              disabled={!mail}
              className={cn(TOOL, action === 'trash' && 'text-destructive')}
              onClick={() => onAction(action)}
            >
              <Icon aria-hidden="true" />{t(source === 'archive' ? `archives.action.${action}` : `mails.action.${action}`)}
            </Button>
          ))}
          {onCreateRule && (
            <Button
              variant="ghost"
              disabled={!mail}
              className={TOOL}
              onClick={() => onCreateRule(formatEmail(mail?.from ?? ''))}
            >
              <Zap aria-hidden="true" />{t('mails.createRule')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
