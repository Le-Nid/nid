import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCreateRule, useRulePreview } from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatSender } from '@/utils/format'

type Sender = { sender: string; email: string }

/**
 * « Toujours faire ça » (I3) from a sender: a daily rule « from contains <email> → corbeille », with the
 * number of mails it matches now. shortcut: trash only; the full RuleSheet (any action, edit) comes with L7.
 */
export function SenderRuleSheet({ accountId, sender, onClose }: Readonly<{ accountId: string; sender: Sender | null; onClose: () => void }>) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={!!sender} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} showCloseButton={false} className="max-h-[90dvh] sm:max-w-md">
        {/* Keyed: the name field starts from this sender's default each time */}
        {sender && <RuleForm key={sender.email} accountId={accountId} sender={sender} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function RuleForm({ accountId, sender, onClose }: Readonly<{ accountId: string; sender: Sender; onClose: () => void }>) {
  const { t } = useTranslation()
  const nameId = useId()
  const display = formatSender(sender.sender) || sender.email
  const [name, setName] = useState(() => t('cleanup.rule.defaultName', { sender: display }))
  const conditions = [{ field: 'from', operator: 'contains', value: sender.email }]
  const preview = useRulePreview(accountId, conditions)
  const create = useCreateRule(accountId)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      { name: name.trim(), conditions, action: { type: 'trash' }, schedule: 'daily', is_active: true },
      {
        onSuccess: () => {
          toast.success(t('cleanup.rule.created'))
          onClose()
        },
        onError: () => toast.error(t('cleanup.rule.failed')),
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{t('cleanup.rule.title', { sender: display })}</SheetTitle>
        <SheetDescription>{t('cleanup.rule.description')}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium">{t('cleanup.rule.name')}</label>
          <Input id={nameId} required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base md:h-9 md:text-sm" />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('cleanup.rule.if')}</dt>
          <dd className="break-all">{t('cleanup.rule.condition', { email: sender.email })}</dd>
          <dt className="text-muted-foreground">{t('cleanup.rule.then')}</dt>
          <dd>{t('cleanup.rule.action')}</dd>
        </dl>
        <p aria-live="polite" className="rounded-lg bg-muted px-3 py-2 text-sm">
          {preview.isError && t('cleanup.rule.previewError')}
          {preview.data && t('cleanup.rule.preview', { count: preview.data.estimatedCount })}
          {preview.isLoading && t('cleanup.rule.previewLoading')}
        </p>
      </div>
      <SheetFooter className="pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button type="submit" className="h-11 md:h-9" disabled={create.isPending || !name.trim()}>{t('cleanup.rule.create')}</Button>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onClose}>{t('common.cancel')}</Button>
      </SheetFooter>
    </form>
  )
}
