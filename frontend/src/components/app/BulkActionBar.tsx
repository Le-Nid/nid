import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Ellipsis, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export type BulkAction = { label: string; icon?: ReactNode; onSelect: () => void; destructive?: boolean }

const MOBILE_SLOTS = 4 // prototype 3: four actions in the bottom bar, the rest under « Plus »

/**
 * Actions on the selection (§5.2, §6.4): inline bar above the list ≥md, fixed bottom bar above the safe area <md.
 * mode 'ids' = `count` selected rows; `total` (Gmail estimate) is passed when the whole page is selected
 * and offers « Sélectionner les ~N résultats » (I2). mode 'query' = the whole search is selected (~total).
 */
export function BulkActionBar({ count, total, mode, actions, onSelectAll, onClear }: Readonly<{
  count: number
  total?: number
  mode: 'ids' | 'query'
  actions: BulkAction[]
  onSelectAll?: () => void
  onClear: () => void
}>) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  if (count === 0) return null

  const counter = mode === 'query'
    ? t('bulkBar.selectedEstimate', { count: total ?? count })
    : t('bulkBar.selected', { count })
  const visible = isMobile ? actions.slice(0, MOBILE_SLOTS) : actions
  const overflow = isMobile ? actions.slice(MOBILE_SLOTS) : []

  const banner = mode === 'ids' && total !== undefined && total > count && onSelectAll && (
    <p className="flex flex-wrap items-center justify-center gap-x-1 rounded-lg bg-muted px-3 py-2 text-center text-sm">
      {t('bulkBar.pageSelected', { count })}
      <Button variant="link" className="h-auto min-h-6 p-0 font-semibold text-primary-text" onClick={onSelectAll}>
        {t('bulkBar.selectAll', { count: total })}
      </Button>
    </p>
  )

  const clear = (
    <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={t('bulkBar.clear')} onClick={onClear}>
      <X aria-hidden="true" />
    </Button>
  )

  if (!isMobile) {
    return (
      <div className="flex flex-col gap-2">
        <div role="toolbar" aria-label={t('bulkBar.label')} className="flex min-h-14 flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-3 py-2">
          <span aria-live="polite" className="px-1 font-semibold text-primary-text tabular-nums">{counter}</span>
          {visible.map((a) => (
            <Button key={a.label} size="sm" variant={a.destructive ? 'destructive' : 'outline'} onClick={a.onSelect}>
              {a.icon}{a.label}
            </Button>
          ))}
          <span className="ml-auto">{clear}</span>
        </div>
        {banner}
      </div>
    )
  }

  return (
    <>
      {banner}
      <div
        role="toolbar"
        aria-label={t('bulkBar.label')}
        className="fixed inset-x-0 bottom-0 z-30 flex flex-col border-t bg-background px-2 pb-[max(22px,env(safe-area-inset-bottom))] shadow-actionbar"
      >
        <div className="flex items-center justify-between px-2">
          <span aria-live="polite" className="font-semibold text-primary-text tabular-nums">{counter}</span>
          {clear}
        </div>
        <div className="flex">
          {visible.map((a) => (
            <Button
              key={a.label}
              variant="ghost"
              className={cn('h-auto min-h-[52px] flex-1 flex-col gap-1 px-1 text-[12px] whitespace-normal', a.destructive && 'text-destructive')}
              onClick={a.onSelect}
            >
              {a.icon}{a.label}
            </Button>
          ))}
          {overflow.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto min-h-[52px] flex-1 flex-col gap-1 px-1 text-[12px]">
                  <Ellipsis aria-hidden="true" />{t('bulkBar.more')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                {overflow.map((a) => (
                  <DropdownMenuItem key={a.label} variant={a.destructive ? 'destructive' : 'default'} onSelect={a.onSelect} className="min-h-11">
                    {a.icon}{a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </>
  )
}
