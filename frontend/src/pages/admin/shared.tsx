import { useId, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const PAGE_SIZE = 20

/** Filters and page of an admin tab, in the URL (§3.3). A new filter goes back to page 1. */
export function useTabParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>
  const page = Math.max(1, Number(params.get('page')) || 1)
  const set = (patch: Partial<Record<K | 'page', string>>) =>
    // Functional update: quick successive changes (typing) build on each other
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v) out.set(k, v as string)
        else out.delete(k)
      }
      if (!('page' in patch)) out.delete('page')
      return out
    }, { replace: true })
  return { values, page, set }
}

/** « Page 2 sur 5 » with previous/next; nothing when everything fits on one page. */
export function Pager({ page, total, onChange }: Readonly<{ page: number; total: number; onChange: (page: number) => void }>) {
  const { t } = useTranslation()
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <nav aria-label={t('admin.pager.label')} className="flex items-center justify-end gap-2">
      <Button variant="outline" size="icon" className="size-11 md:size-9" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('admin.pager.previous')}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="text-sm text-muted-foreground">{t('admin.pager.status', { page, pages })}</span>
      <Button variant="outline" size="icon" className="size-11 md:size-9" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('admin.pager.next')}>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  )
}

/** A titled card of the Système tab. */
export function Section({ title, description, actions, children }: Readonly<{
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}>) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export const selectClass = 'h-11 rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm'
