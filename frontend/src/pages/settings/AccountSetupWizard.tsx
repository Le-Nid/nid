import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { archiveApi, type BackupInterval } from '@/api'
import { useCreateRuleFromTemplate, useRulePreview, useRuleTemplates, useUpdateGmailAccount } from '@/hooks/queries'
import type { GmailAccount } from '@/store/auth.store'
import { cn } from '@/lib/utils'
import { SwitchRow, selectClass } from './shared'

type Template = {
  id: string
  name: string
  description: string
  category: string
  dto: { conditions: unknown[]; action: { type: string }; schedule: string }
}
type FirstBackup = 'year' | 'all' | 'none'

const INTERVALS: BackupInterval[] = ['1h', '6h', '24h']
const FIRST_BACKUPS: FirstBackup[] = ['year', 'all', 'none']
// An IMAP sync takes whole folders (no date filter), and rules act through Gmail
const IMAP_FIRST_BACKUPS: FirstBackup[] = ['all', 'none']
// Label and expiry templates already live in Règles & libellés › Libellés
const WIZARD_CATEGORIES = new Set(['cleanup', 'archive', 'organize'])
const GMAIL_STEPS = ['google', 'backup', 'rules', 'summary'] as const
const IMAP_STEPS = ['imap', 'backup', 'summary'] as const

/** What a template would act on right now (Gmail estimate), loaded when the rules step is shown. */
function TemplateRow({ accountId, template, checked, onChange }: Readonly<{
  accountId: string
  template: Template
  checked: boolean
  onChange: (checked: boolean) => void
}>) {
  const { t } = useTranslation()
  const id = useId()
  const preview = useRulePreview(accountId, template.dto.conditions).data as { estimatedCount: number } | undefined
  return (
    <li className="flex items-start gap-3 py-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-describedby={`${id}-desc`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={id} className="text-sm font-medium">{template.name}</label>
        <span id={`${id}-desc`} className="text-sm text-muted-foreground">
          {t(`rules.action.${template.dto.action.type}`)} · {t(`rules.schedule.${template.dto.schedule}`)} · {template.description}
        </span>
      </div>
      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
        {preview ? t('settings.gmail.wizard.matches', { count: preview.estimatedCount }) : <Skeleton className="h-4 w-16" />}
      </span>
    </li>
  )
}

/**
 * After Google adds an account (§7.7): automatic backup, a first backup, starter rules, then a summary.
 * Every step can be skipped; nothing is saved before « Terminer ».
 */
export function AccountSetupWizard({ account, onClose }: Readonly<{ account: GmailAccount; onClose: () => void }>) {
  const { t } = useTranslation()
  const id = useId()
  const templates = ((useRuleTemplates().data ?? []) as Template[]).filter((tpl) => WIZARD_CATEGORIES.has(tpl.category))
  const update = useUpdateGmailAccount()
  const fromTemplate = useCreateRuleFromTemplate(account.id)
  const imap = account.provider === 'imap'
  const steps: readonly string[] = imap ? IMAP_STEPS : GMAIL_STEPS
  const [step, setStep] = useState(1)
  const current = steps[step]
  const [backupEnabled, setBackupEnabled] = useState(!!account.backup_enabled)
  const [every, setEvery] = useState<BackupInterval>(account.backup_interval ?? '24h')
  const [firstBackup, setFirstBackup] = useState<FirstBackup>(imap ? 'all' : 'year')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const toggle = (templateId: string, on: boolean) => setSelected((prev) => {
    const next = new Set(prev)
    if (on) next.add(templateId)
    else next.delete(templateId)
    return next
  })
  const chosen = templates.filter((tpl) => selected.has(tpl.id))

  const finish = async () => {
    setSaving(true)
    try {
      await update.mutateAsync({ id: account.id, backup_enabled: backupEnabled, backup_interval: every })
      // Independent (no Gmail label to create for these categories): created side by side
      await Promise.all(chosen.map((tpl) => fromTemplate.mutateAsync(tpl.id)))
      if (firstBackup !== 'none') {
        await archiveApi.triggerArchive(account.id, { differential: true, ...(firstBackup === 'year' ? { query: 'newer_than:1y' } : {}) })
      }
      toast.success(t('settings.gmail.wizard.done'))
      onClose()
    } catch {
      toast.error(t('settings.gmail.wizard.failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('settings.gmail.wizard.title')}</DialogTitle>
          <DialogDescription>{t('settings.gmail.wizard.description', { email: account.email })}</DialogDescription>
        </DialogHeader>

        <ol className="flex gap-2 text-xs" aria-label={t('settings.gmail.wizard.steps')}>
          {steps.map((key, i) => (
            <li key={key} aria-current={i === step ? 'step' : undefined} className="flex flex-1 flex-col gap-1">
              <span className={cn('h-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} aria-hidden="true" />
              <span className={cn('flex items-center gap-1', i === step ? 'font-semibold' : 'text-muted-foreground')}>
                {i < step && <Check aria-hidden="true" className="size-3" />}
                {t(`settings.gmail.wizard.step.${key}`)}
              </span>
            </li>
          ))}
        </ol>

        {current === 'backup' && (
          <div className="flex flex-col gap-4">
            <SwitchRow
              label={t('settings.gmail.autoBackup')}
              description={t('settings.gmail.autoBackupHint')}
              checked={backupEnabled}
              onChange={setBackupEnabled}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${id}-every`} className="text-sm font-medium">{t('settings.gmail.frequency')}</label>
              <select id={`${id}-every`} value={every} disabled={!backupEnabled} onChange={(e) => setEvery(e.target.value as BackupInterval)} className={selectClass}>
                {INTERVALS.map((every) => <option key={every} value={every}>{t(`settings.gmail.every.${every}`)}</option>)}
              </select>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('settings.gmail.wizard.firstBackup')}</legend>
              {(imap ? IMAP_FIRST_BACKUPS : FIRST_BACKUPS).map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-3 text-sm md:min-h-0">
                  <input type="radio" name={`${id}-first`} value={value} checked={firstBackup === value} onChange={() => setFirstBackup(value)} className="size-4 accent-primary" />
                  {t(`settings.gmail.wizard.first.${value}`)}
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {current === 'rules' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t('settings.gmail.wizard.rulesHint')}</p>
            <ul className="flex flex-col divide-y">
              {templates.map((tpl) => (
                <TemplateRow key={tpl.id} accountId={account.id} template={tpl} checked={selected.has(tpl.id)} onChange={(on) => toggle(tpl.id, on)} />
              ))}
            </ul>
          </div>
        )}

        {current === 'summary' && (
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-medium">{t('settings.gmail.autoBackup')}</dt>
            <dd>{backupEnabled ? t(`settings.gmail.every.${every}`) : t('settings.gmail.wizard.off')}</dd>
            <dt className="font-medium">{t('settings.gmail.wizard.firstBackup')}</dt>
            <dd>{t(`settings.gmail.wizard.first.${firstBackup}`)}</dd>
            {!imap && <dt className="font-medium">{t('settings.gmail.wizard.step.rules')}</dt>}
            {!imap && (
              <dd>
                {chosen.length
                  ? <ul className="list-disc pl-4">{chosen.map((tpl) => <li key={tpl.id}>{tpl.name} ({t(`rules.action.${tpl.dto.action.type}`)}, {t(`rules.schedule.${tpl.dto.schedule}`)})</li>)}</ul>
                  : t('settings.gmail.wizard.noRules')}
              </dd>
            )}
          </dl>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" className="h-11 md:h-9" disabled={saving} onClick={() => setStep(step - 1)}>{t('settings.gmail.wizard.back')}</Button>}
          <Button variant="ghost" className="h-11 md:h-9" disabled={saving} onClick={onClose}>{t('settings.gmail.wizard.later')}</Button>
          {step < steps.length - 1
            ? <Button className="h-11 md:h-9" onClick={() => setStep(step + 1)}>{t('settings.gmail.wizard.next')}</Button>
            : <Button className="h-11 md:h-9" disabled={saving} onClick={() => void finish()}>{t('settings.gmail.wizard.finish')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
