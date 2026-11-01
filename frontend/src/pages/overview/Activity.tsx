import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/app/EmptyState'
import { LoadError } from '@/components/app/LoadError'
import { useActivityHeatmap, useInboxZero } from '@/hooks/queries'

type Day = { day: string; count: number }

/** One bar per day (CSS, no chart library), the same figures as a table for screen readers. */
export function DayBars({ days, caption }: Readonly<{ days: Day[]; caption: string }>) {
  const { t, i18n } = useTranslation()
  const max = Math.max(1, ...days.map((d) => d.count))
  const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return (
    <figure className="flex flex-col gap-2">
      <div aria-hidden="true" className="flex h-32 items-end justify-center gap-0.5">
        {days.map((d) => (
          <span
            key={d.day}
            title={t('overview.daily.bar', { day: label(d.day), count: d.count })}
            className="max-w-8 flex-1 rounded-t-sm bg-primary"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground">
        <span>{label(days[0].day)}</span><span>{label(days.at(-1)!.day)}</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead><tr><th scope="col">{t('overview.daily.day')}</th><th scope="col">{t('overview.daily.mails')}</th></tr></thead>
          <tbody>{days.map((d) => <tr key={d.day}><td>{label(d.day)}</td><td>{d.count}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const WEEK = Array.from({ length: 7 }, (_, d) => d)

/** « lun. » … « dim. » and « 09 h » / « 9 AM » in the reader's language (2024-01-01 was a Monday). */
function useLabels() {
  const { i18n } = useTranslation()
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' })
  const hourFmt = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', timeZone: 'UTC' })
  return {
    day: (d: number) => weekday.format(Date.UTC(2024, 0, 1 + d)),
    hour: (h: number) => hourFmt.format(Date.UTC(2024, 0, 1, h)),
  }
}

/** Archived mails per weekday × hour in the reader's time zone: one hue, darker = more mails. */
export function ActivityHeatmap({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation()
  const query = useActivityHeatmap(accountId)
  const label = useLabels()
  if (query.isError) return <LoadError message={t('overview.activity.loadError')} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton className="h-40 w-full" />
  if (!query.data.length) return <EmptyState icon={<Clock />} title={t('overview.activity.empty')} />

  const grid = new Map(query.data.map((c) => [`${c.day}-${c.hour}`, c.count]))
  const count = (d: number, h: number) => grid.get(`${d}-${h}`) ?? 0
  const peak = query.data.reduce((a, b) => (b.count > a.count ? b : a))
  const cell = (d: number, h: number) => t('overview.activity.cell', { day: label.day(d), hour: label.hour(h), count: count(d, h) })

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm text-muted-foreground">
        {t('overview.activity.peak', { day: label.day(peak.day), hour: label.hour(peak.hour), count: peak.count })}
      </figcaption>
      <div aria-hidden="true" className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5 text-xs text-muted-foreground">
        <span />
        {[0, 6, 12, 18].map((h) => <span key={h} className="col-span-6 whitespace-nowrap">{label.hour(h)}</span>)}
        {WEEK.map((d) => [
          <span key={`l${d}`} className="pr-1 leading-4">{label.day(d)}</span>,
          ...HOURS.map((h) => (
            <span key={`${d}-${h}`} title={cell(d, h)} className="h-4 overflow-hidden rounded-[2px] bg-muted">
              {count(d, h) > 0 && <span className="block size-full bg-primary" style={{ opacity: 0.15 + 0.85 * (count(d, h) / peak.count) }} />}
            </span>
          )),
        ])}
      </div>
      {/* A table ignores sr-only's 1px width and would widen the page on mobile: the div clips it */}
      <div className="sr-only">
        <table>
          <caption>{t('overview.activity.title')}</caption>
          <thead>
            <tr><th scope="col">{t('overview.daily.day')}</th>{HOURS.map((h) => <th key={h} scope="col">{label.hour(h)}</th>)}</tr>
          </thead>
          <tbody>
            {WEEK.map((d) => (
              <tr key={d}><th scope="row">{label.day(d)}</th>{HOURS.map((h) => <td key={h}>{count(d, h)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/** Gmail inbox now, the days at zero in a row, and its size over 30 days (snapshots every 6 h, the day's lowest). */
export function InboxZero({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation()
  const query = useInboxZero(accountId)
  if (query.isError) return <LoadError message={t('overview.inboxZero.loadError')} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton className="h-40 w-full" />
  const { current, history, streak, bestStreak } = query.data
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {t('overview.inboxZero.current', { count: current.inboxCount })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t('overview.inboxZero.unread', { count: current.unreadCount })} · {t('overview.inboxZero.streak', { count: streak, best: bestStreak })}
        </span>
      </div>
      {history.length > 1 && (
        <DayBars days={history.map((h) => ({ day: h.date.slice(0, 10), count: h.inboxCount }))} caption={t('overview.inboxZero.history')} />
      )}
    </div>
  )
}
