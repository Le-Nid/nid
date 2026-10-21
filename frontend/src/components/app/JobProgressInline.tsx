import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Progress } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { useJobSSE, type JobState } from '@/hooks/useJobSSE'
import { jobsApi } from '@/api'

const TERMINAL = new Set<JobState['status']>(['completed', 'failed', 'cancelled'])

/** Progress of a job where it was launched (§6.6): sender row, archives banner, rule card, sidebar footer. */
export function JobProgressInline({ jobId, label, onDone }: Readonly<{
  jobId: string
  label: string
  onDone?: (job: JobState) => void
}>) {
  const { t, i18n } = useTranslation()
  const { job } = useJobSSE(jobId)
  const done = !!job && TERMINAL.has(job.status)
  // A delayed (undo window) or queued job has no total yet: "0 / 0" would read as an empty result
  const started = done || (job?.total ?? 0) > 0

  useEffect(() => {
    if (done) onDone?.(job)
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps -- once, when the job ends

  const n = new Intl.NumberFormat(i18n.language)
  const stop = () => jobsApi.cancel(jobId).catch(() => toast.error(t('jobProgress.stopFailed')))

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {job && !done && (
          <Button variant="ghost" size="sm" className="h-11 md:h-7" onClick={stop}>{t('jobProgress.stop')}</Button>
        )}
      </div>
      {/* Radix primitive: shadcn's Progress does not forward `value`, so it would drop aria-valuenow */}
      <Progress.Root value={job?.progress ?? null} aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-border">
        <Progress.Indicator
          className="h-full bg-progress transition-transform motion-reduce:transition-none"
          style={{ transform: `translateX(-${100 - (job?.progress ?? 0)}%)` }}
        />
      </Progress.Root>
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {started ? `${n.format(job?.processed ?? 0)} / ${n.format(job?.total ?? 0)}` : t('jobProgress.waiting')}
        </span>
        <span aria-live="polite">{done && t(`jobProgress.${job.status}`, { count: job.processed, error: job.error })}</span>
      </div>
    </div>
  )
}
