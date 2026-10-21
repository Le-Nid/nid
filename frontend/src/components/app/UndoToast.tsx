import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type UndoToastOptions = {
  /** « Suppression de 3 mails » — the countdown is appended. */
  message: string
  /** « Vers la corbeille Gmail · suivi dans Activité » */
  description?: string
  /** Cancels the delayed job (`DELETE /api/jobs/:id`) and rolls back the optimistic UI. */
  onUndo: () => void
  delayMs?: number
}

function UndoToast({ id, message, description, onUndo, delayMs }: Readonly<UndoToastOptions & { id: string | number; delayMs: number }>) {
  const { t } = useTranslation()
  const [seconds, setSeconds] = useState(Math.ceil(delayMs / 1000))

  // Own timer rather than sonner's: sonner pauses on hover, the server-side delay does not.
  useEffect(() => {
    const end = Date.now() + delayMs
    const timer = setInterval(() => {
      const left = Math.ceil((end - Date.now()) / 1000)
      if (left <= 0) toast.dismiss(id)
      else setSeconds(left)
    }, 250)
    return () => clearInterval(timer)
  }, [id, delayMs])

  return (
    <div className="relative flex w-full items-center gap-3 overflow-hidden rounded-xl bg-toast p-3.5 text-toast-foreground shadow-toast">
      <div className="min-w-0 flex-1">
        {/* Announced once by the Toaster's polite live region; the ticking copy is hidden from it */}
        <p className="sr-only">{t('undoToast.message', { message, seconds: Math.ceil(delayMs / 1000) })}</p>
        <p aria-hidden="true" className="text-sm font-medium tabular-nums">{t('undoToast.message', { message, seconds })}</p>
        {description && <p className="text-xs opacity-80">{description}</p>}
      </div>
      <Button
        variant="ghost"
        className="h-11 font-semibold text-toast-progress hover:bg-toast-foreground/10 hover:text-toast-progress md:h-8"
        onClick={() => {
          onUndo()
          toast.dismiss(id)
        }}
      >
        {t('undoToast.undo')}
      </Button>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1 origin-left animate-drain bg-toast-progress motion-reduce:animate-none"
        style={{ animationDuration: `${delayMs}ms` }}
      />
    </div>
  )
}

/**
 * D1 toast: the action is already queued server-side with a delay; « Annuler » within `delayMs` cancels it.
 * Never closes before the deadline. Needs the app's `<Toaster />` (AppShell).
 */
export function showUndoToast({ delayMs = 10_000, ...options }: UndoToastOptions) {
  return toast.custom((id) => <UndoToast id={id} delayMs={delayMs} {...options} />, { duration: Infinity })
}
