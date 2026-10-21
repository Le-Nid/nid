import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Lightbulb, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/app/EmptyState'
import { LoadError } from '@/components/app/LoadError'
import { JobProgressInline } from '@/components/app/JobProgressInline'
import { RuleSheet } from '@/components/app/RuleSheet'
import { useCleanupSuggestions, useDismissSuggestion, useNewsletters } from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatBytes, formatEmail } from '@/utils/format'
import { senderName, UnsubscribeButton, useSenderCleanup, type NewsletterSender } from '../cleanup/SendersTab'

type Suggestion = { id: string; type: string; title: string; sender: string | null; emailCount: number; totalSizeBytes: number }

const MAX = 4

/** Suggestions (§7.1): « Se désabonner et nettoyer » as on Nettoyage, « Toujours faire ça » = RuleSheet, « Ignorer » = dismiss. */
export function Suggestions({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const suggestions = useCleanupSuggestions(accountId)
  // The scan holds the List-Unsubscribe target the suggestion lacks
  const scanned: NewsletterSender[] = useNewsletters(accountId).data?.senders ?? []
  const dismiss = useDismissSuggestion()
  const { jobs, done, unsubscribe } = useSenderCleanup(accountId)
  const [ruleFor, setRuleFor] = useState<string | null>(null)

  const ignore = (id: string) => dismiss.mutate(id, { onError: () => toast.error(t('overview.suggestions.dismissFailed')) })

  if (suggestions.isError) {
    return <LoadError message={t('overview.suggestions.loadError')} onRetry={() => void suggestions.refetch()} />
  }
  if (suggestions.isLoading) return <Skeleton className="h-24 w-full" />
  const list = (suggestions.data as Suggestion[] | undefined ?? []).filter((s) => s.sender).slice(0, MAX)
  if (!list.length) return <EmptyState icon={<Lightbulb />} title={t('overview.suggestions.empty')} />

  const cls = 'h-11 md:h-8'
  return (
    <>
      <ul className="flex flex-col divide-y">
        {list.map((s) => {
          const email = formatEmail(s.sender!)
          const sender: NewsletterSender = scanned.find((n) => n.email === email) ?? {
            sender: s.sender!, email, count: s.emailCount, totalSizeBytes: s.totalSizeBytes, unreadCount: 0,
            unsubscribeUrl: null, unsubscribeMailto: null, latestDate: '',
          }
          const job = jobs[email]
          const textId = `suggestion-${s.id}`
          return (
            <li key={s.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <p id={textId} className="text-sm">
                {t(`overview.suggestions.${s.type}`, {
                  sender: senderName(sender), count: s.emailCount, size: formatBytes(s.totalSizeBytes), defaultValue: s.title,
                })}
              </p>
              {job?.jobId && (
                <JobProgressInline
                  jobId={job.jobId}
                  label={job.label}
                  onDone={(j) => {
                    void done(email, j)
                    if (j.status === 'completed') ignore(s.id)
                  }}
                />
              )}
              {job && !job.jobId && <p className="text-sm text-muted-foreground">{job.label}</p>}
              {!job && (
                <div role="group" aria-labelledby={textId} className={isMobile ? 'flex flex-col gap-2' : 'flex flex-wrap gap-1.5'}>
                  <UnsubscribeButton sender={sender} stacked={isMobile} className={cls} onConfirm={() => unsubscribe(sender)} />
                  <Button variant="ghost" className={cls} onClick={() => setRuleFor(email)}>
                    <Zap aria-hidden="true" />{t('cleanup.action.rule')}
                  </Button>
                  <Button variant="ghost" className={cls} disabled={dismiss.isPending} onClick={() => ignore(s.id)}>
                    {t('overview.suggestions.dismiss')}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <RuleSheet accountId={accountId} target={ruleFor ? { from: ruleFor } : null} onClose={() => setRuleFor(null)} />
    </>
  )
}
