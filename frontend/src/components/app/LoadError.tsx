import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** Inline load error with « Réessayer » (§6.5). */
export function LoadError({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
      <span className="flex-1">{message}</span>
      <Button variant="outline" onClick={onRetry}>{t('mails.retry')}</Button>
    </div>
  )
}
