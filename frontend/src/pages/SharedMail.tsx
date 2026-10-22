import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Calendar, Link2Off, Loader2, Mail, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { sharingApi } from '../api'
import { EmptyState } from '@/components/app/EmptyState'
import { MailFrame } from '@/components/app/MailViewer'

type SharedMail = { subject?: string; sender?: string; recipient?: string; date?: string; htmlBody?: string; textBody?: string }

const chip = 'inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-0.5 text-sm'

export default function SharedMailPage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [mail, setMail] = useState<SharedMail | null>(null)
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
      <output aria-label={t('common.loading')} className="grid min-h-[60dvh] place-items-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </output>
    )
  }

  if (error || !mail) {
    return (
      <main className="grid min-h-[60dvh] place-items-center bg-background px-4">
        <EmptyState icon={<Link2Off />} title={t('sharing.notFound')} description={t('sharing.notFoundDesc')} />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-6 md:py-10">
      <article className="mx-auto flex max-w-3xl flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6">
        <h1 className="flex items-start gap-2 text-xl font-semibold break-words">
          <Mail className="mt-1 size-5 shrink-0" aria-hidden="true" />
          {mail.subject || t('common.noSubject')}
        </h1>

        <div className="flex flex-wrap gap-2">
          <span className={chip}><User className="size-3.5" aria-hidden="true" />{mail.sender}</span>
          {mail.recipient && <span className={chip}>{t('sharing.to')}: {mail.recipient}</span>}
          {mail.date && (
            <span className={chip}><Calendar className="size-3.5" aria-hidden="true" />{dayjs(mail.date).format('DD/MM/YYYY HH:mm')}</span>
          )}
        </div>

        <p className="self-start rounded-md bg-warning-soft px-2 py-0.5 text-sm text-warning">{t('sharing.sharedLink')}</p>

        {mail.htmlBody || mail.textBody ? (
          <div className="flex min-h-[50dvh] flex-col overflow-hidden rounded-lg border">
            <MailFrame html={mail.htmlBody ?? ''} text={mail.textBody ?? ''} />
          </div>
        ) : (
          <p className="text-muted-foreground">{t('sharing.noContent')}</p>
        )}
      </article>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t('sharing.poweredBy')}</p>
    </main>
  )
}
