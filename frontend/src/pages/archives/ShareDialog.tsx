import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, Link2Off } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useCreateShare, useRevokeShare, useShares } from '@/hooks/queries'
import { DateCell } from './shared'

/** A row of `GET /api/shares`. */
export type Share = {
  id: string
  archived_mail_id: string
  token: string
  expires_at: string
  access_count: number
  max_access: number | null
  subject: string | null
  sender: string | null
}

const HOURS = [1, 24, 72, 168, 720] // the API caps a link at 30 days

const shareUrl = (token: string) => `${window.location.origin}/shared/${token}`
const isLive = (s: Share) => new Date(s.expires_at).getTime() > Date.now() && (s.max_access === null || s.access_count < s.max_access)

/** Active links, newest first (the API also returns expired and used-up ones). */
export function useActiveShares() {
  const query = useShares()
  const shares: Share[] = query.data ?? []
  return { ...query, shares: shares.filter(isLive) }
}

function CopyLink({ token, name }: Readonly<{ token: string; name: string }>) {
  const { t } = useTranslation()
  const copy = () => navigator.clipboard.writeText(shareUrl(token)).then(
    () => toast.success(t('archives.share.copied')),
    () => toast.error(t('archives.share.copyFailed')),
  )
  return (
    <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={t('archives.share.copy', { name })} onClick={() => void copy()}>
      <Copy aria-hidden="true" />
    </Button>
  )
}

/** Copy and revoke one link; `name` tells the links apart for screen readers. */
export function ShareActions({ share, name }: Readonly<{ share: Share; name: string }>) {
  const { t } = useTranslation()
  const revoke = useRevokeShare()
  return (
    <span className="flex justify-end gap-1">
      <CopyLink token={share.token} name={name} />
      <Button
        variant="ghost"
        size="icon"
        className="size-11 text-destructive md:size-8"
        aria-label={t('archives.share.revoke', { name })}
        disabled={revoke.isPending}
        onClick={() => revoke.mutate(share.id, {
          onSuccess: () => toast.success(t('archives.share.revoked')),
          onError: () => toast.error(t('archives.share.revokeFailed')),
        })}
      >
        <Link2Off aria-hidden="true" />
      </Button>
    </span>
  )
}

/** « Partager » (P7): link duration, the new link to copy, and this mail's active links to revoke. */
export function ShareDialog({ mailId, subject, onClose }: Readonly<{ mailId: string | null; subject: string; onClose: () => void }>) {
  const { t } = useTranslation()
  const id = useId()
  const create = useCreateShare()
  const { shares } = useActiveShares()
  const [hours, setHours] = useState(24)
  const mine = shares.filter((s) => s.archived_mail_id === mailId)

  const submit = () => mailId && create.mutate({ archivedMailId: mailId, expiresInHours: hours }, {
    onError: () => toast.error(t('archives.share.createFailed')),
  })

  return (
    <Dialog open={!!mailId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('archives.share.title')}</DialogTitle>
          <DialogDescription>{t('archives.share.description', { subject })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-hours`} className="text-sm font-medium">{t('archives.share.duration')}</label>
          <div className="flex gap-2">
            <select
              id={`${id}-hours`}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="h-11 flex-1 rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm"
            >
              {HOURS.map((h) => <option key={h} value={h}>{t(`archives.share.hours.${h}`)}</option>)}
            </select>
            <Button className="h-11 md:h-9" disabled={create.isPending} onClick={submit}>{t('archives.share.create')}</Button>
          </div>
        </div>
        {create.data && mailId === create.variables?.archivedMailId && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-link`} className="text-sm font-medium">{t('archives.share.link')}</label>
            <div className="flex items-center gap-1">
              <Input id={`${id}-link`} readOnly value={shareUrl(create.data.token)} onFocus={(e) => e.target.select()} className="h-11 md:h-9" />
              <CopyLink token={create.data.token} name={subject} />
            </div>
          </div>
        )}
        {mine.length > 0 && (
          <section aria-labelledby={`${id}-active`} className="flex flex-col gap-1">
            <h3 id={`${id}-active`} className="text-sm font-medium">{t('archives.share.active', { count: mine.length })}</h3>
            <ul className="flex flex-col">
              {mine.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{t('archives.share.expires')} <DateCell value={s.expires_at} /></span>
                  <ShareActions share={s} name={t('archives.share.linkName', { n: i + 1, subject })} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" className="h-11 md:h-9">{t('common.close')}</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
