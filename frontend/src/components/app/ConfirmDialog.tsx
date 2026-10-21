import type { ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/**
 * D2 only: confirmation of a definitive action (permanent deletion, unsubscribe, account disconnection).
 * Reversible actions use UndoToast instead. Radix focuses « Annuler » on open and returns focus to `trigger`.
 * `confirmLabel` is an explicit verb: « Supprimer définitivement 12 archives ».
 * Without `trigger` (opened from a menu item), the caller drives it with `open`/`onOpenChange`.
 */
export function ConfirmDialog({ trigger, open, onOpenChange, title, description, confirmLabel, onConfirm, destructive }: Readonly<{
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
}>) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 md:h-9">{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn('h-11 md:h-9', destructive && 'bg-destructive-solid text-white hover:bg-destructive-solid-hover')}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
