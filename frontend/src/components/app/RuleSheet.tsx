import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { jobsApi } from '@/api'
import { useCreateRule, useLabels, useRulePreview, useRunRule, useUpdateRule } from '@/hooks/queries'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatBytes, formatSender } from '@/utils/format'
import type { ApiLabel } from '@/utils/gmail'
import type { ActionType, Rule, RuleAction, RuleCondition, RulePreview } from '@/types/rules'
import { showUndoToast } from './UndoToast'

/** What the sheet opens on: an existing rule (edit), or a prefill from where the need appeared (I3). */
export type RuleSheetTarget = { rule?: Rule; from?: string; labelId?: string }

// « Et qu'il a plus de » and « Exécution » choices; '' = none / manual. « Expire dans X jours » = an age + Supprimer.
const AGES = ['', '7d', '30d', '180d']
const ACTIONS: ActionType[] = ['archive_nas', 'archive', 'trash', 'label']
const SCHEDULES = ['', 'daily', 'weekly']
const NEGATIVE = new Set(['not_contains', 'not_equals'])

const isFrom = (c: RuleCondition) => c.field === 'from' && c.operator === 'contains'
const isAge = (c: RuleCondition) => c.field === 'older_than' && AGES.includes(String(c.value))
export const userLabels = (labels: ApiLabel[]) => labels.filter((l) => l.type === 'user' && !l.deleted_at)

function duration(value: RuleCondition['value'], t: TFunction) {
  const m = /^(\d+)([dmy])$/.exec(String(value))
  return m ? t(`rules.duration.${m[2]}`, { count: Number(m[1]) }) : String(value)
}

/** One condition in plain language: « de news@x.fr », « de plus de 30 jours »… */
export function describeCondition(c: RuleCondition, t: TFunction): string {
  const not = NEGATIVE.has(c.operator) ? 'Not' : ''
  switch (c.field) {
    case 'has_attachment':
      return t(c.value === true || c.value === 'true' ? 'rules.cond.attachment' : 'rules.cond.noAttachment')
    case 'older_than':
    case 'newer_than':
      return t(`rules.cond.${c.field}`, { value: duration(c.value, t) })
    case 'label':
      return t(`rules.cond.label${not}`, { value: t(`labels.${c.value}`, { defaultValue: String(c.value) }) })
    case 'size_gt':
    case 'size_lt':
      return t(`rules.cond.${c.field}`, { value: c.value })
    default:
      return t(`rules.cond.${c.field}${not}`, { value: c.value })
  }
}

export const describeConditions = (conditions: RuleCondition[], t: TFunction) =>
  conditions.map((c) => describeCondition(c, t)).join(', ')

export function describeAction(action: RuleAction, t: TFunction, labels: ApiLabel[]) {
  const label = action.labelId && labels.find((l) => l.id === action.labelId)
  return label ? t('rules.actionWithLabel', { action: t(`rules.action.${action.type}`), label: label.name }) : t(`rules.action.${action.type}`)
}

/** D1: run a rule on the mails already received, after the server's 10 s delay; « Annuler » cancels the job. */
export function useRunRuleWithUndo(accountId: string) {
  const { t } = useTranslation()
  const run = useRunRule(accountId)
  return (rule: Pick<Rule, 'id' | 'name'>) =>
    run.mutateAsync(rule.id).then(
      ({ jobId }) => {
        showUndoToast({
          message: t('rules.run.toast', { name: rule.name }),
          description: t('rules.run.description'),
          onUndo: () => void jobsApi.cancel(jobId).catch(() => toast.error(t('mails.undoFailed'))),
        })
      },
      () => {
        toast.error(t('rules.run.failed'))
      },
    )
}

/** Rule creation and edition (§5.2, §7.4): right sheet ≥md, bottom sheet <md. */
export function RuleSheet({ accountId, target, onClose }: Readonly<{ accountId: string; target: RuleSheetTarget | null; onClose: () => void }>) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} showCloseButton={false} className="max-h-[90dvh] sm:max-w-md">
        {/* Keyed: each target starts from its own values */}
        {target && <RuleForm key={JSON.stringify(target)} accountId={accountId} target={target} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function Choice({ name, value, current, onChange, children }: Readonly<{
  name: string
  value: string
  current: string
  onChange: (value: string) => void
  children: ReactNode
}>) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} className="size-4 accent-primary" />
      {children}
    </label>
  )
}

function Preview({ preview, empty, onNavigate }: Readonly<{
  preview: { data?: RulePreview; isError: boolean }
  empty: boolean
  onNavigate: () => void
}>) {
  const { t } = useTranslation()
  const data = empty ? undefined : preview.data
  let status = t('rules.sheet.previewLoading')
  if (empty) status = t('rules.sheet.needCondition')
  else if (preview.isError) status = t('rules.sheet.previewError')
  else if (data) status = t('rules.sheet.preview', { count: data.estimatedCount, size: formatBytes(data.sizeBytes) })
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <p aria-live="polite" className="font-medium">{status}</p>
      {data && data.samples.length > 0 && (
        <ul aria-label={t('rules.sheet.samples')} className="flex flex-col gap-1">
          {data.samples.slice(0, 3).map((s) => (
            <li key={s.id} className="flex min-w-0 gap-2">
              <span className="shrink-0 font-medium">{formatSender(s.from)}</span>
              <span className="truncate text-muted-foreground">{s.subject || t('mails.noSubject')}</span>
            </li>
          ))}
        </ul>
      )}
      {data && data.estimatedCount > 0 && (
        <Link to={`/mails?q=${encodeURIComponent(data.query)}`} onClick={onNavigate} className="self-start font-medium text-primary-text underline-offset-4 hover:underline">
          {t('rules.sheet.seeMails', { count: data.estimatedCount })}
        </Link>
      )}
    </div>
  )
}

function RuleForm({ accountId, target, onClose }: Readonly<{ accountId: string; target: RuleSheetTarget; onClose: () => void }>) {
  const { t } = useTranslation()
  const id = useId()
  const labels = userLabels(useLabels(accountId).data ?? [])
  const create = useCreateRule(accountId)
  const update = useUpdateRule(accountId)
  const runWithUndo = useRunRuleWithUndo(accountId)

  const { rule } = target
  const initial = rule?.conditions ?? []
  const fromCond = initial.find(isFrom)
  const ageCond = initial.find(isAge)
  // Conditions this form does not edit are kept as they are
  const extras = initial.filter((c) => c !== fromCond && c !== ageCond)

  const [from, setFrom] = useState(String(fromCond?.value ?? target.from ?? ''))
  const [age, setAge] = useState(String(ageCond?.value ?? ''))
  const [action, setAction] = useState<string>(rule?.action.type ?? (target.labelId ? 'label' : 'trash'))
  const [labelId, setLabelId] = useState(rule?.action.labelId ?? target.labelId ?? '')
  const [schedule, setSchedule] = useState<string>(rule ? rule.schedule ?? '' : 'daily')
  const [applyExisting, setApplyExisting] = useState(false)
  const [name, setName] = useState(() => {
    if (rule) return rule.name
    if (target.from) return t('rules.sheet.defaultName', { from: target.from })
    return labels.find((l) => l.id === target.labelId)?.name ?? ''
  })

  const conditions: RuleCondition[] = [
    ...(from.trim() ? [{ field: 'from', operator: 'contains', value: from.trim() } as const] : []),
    ...(age ? [{ field: 'older_than', operator: 'gt', value: age } as const] : []),
    ...extras,
  ]
  // Debounced live preview (I3): typing an address does not fire one request per key
  const key = JSON.stringify(conditions)
  const [debounced, setDebounced] = useState(key)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(key), 400)
    return () => clearTimeout(timer)
  }, [key])
  // An age alone would target the whole mailbox (« tout supprimer de plus de 7 jours »): a sender or a kept condition is required
  const targeted = !!from.trim() || extras.length > 0
  const preview = useRulePreview(accountId, targeted ? JSON.parse(debounced) : null)

  // A rule made elsewhere may use an action or schedule this form does not offer: keep it selectable
  const actions = ACTIONS.includes(action as ActionType) ? ACTIONS : [...ACTIONS, action]
  const schedules = SCHEDULES.includes(schedule) ? SCHEDULES : [...SCHEDULES, schedule]
  const needsLabel = action === 'label' || action === 'unlabel'
  const pending = create.isPending || update.isPending
  const valid = !!name.trim() && targeted && (!needsLabel || !!labelId)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const dto = {
      name: name.trim(),
      conditions,
      action: needsLabel ? { type: action, labelId } : { type: action },
      schedule: schedule || null,
      ...(rule ? {} : { is_active: true }),
    }
    const onSuccess = (saved: Rule) => {
      toast.success(t(rule ? 'rules.sheet.saved' : 'rules.sheet.created'))
      if (applyExisting) void runWithUndo(saved)
      onClose()
    }
    const onError = () => toast.error(t('rules.sheet.failed'))
    if (rule) update.mutate({ ruleId: rule.id, dto }, { onSuccess, onError })
    else create.mutate(dto, { onSuccess, onError })
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{t(rule ? 'rules.sheet.editTitle' : 'rules.sheet.createTitle')}</SheetTitle>
        <SheetDescription>{t('rules.sheet.description')}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">{t('rules.sheet.name')}</label>
          <Input id={`${id}-name`} required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base md:h-9 md:text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-from`} className="text-sm font-medium">{t('rules.sheet.from')}</label>
          <Input
            id={`${id}-from`}
            type="text"
            inputMode="email"
            autoComplete="off"
            aria-describedby={`${id}-from-hint`}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 text-base md:h-9 md:text-sm"
          />
          <p id={`${id}-from-hint`} className="text-xs text-muted-foreground">{t('rules.sheet.fromHint')}</p>
        </div>
        {extras.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('rules.sheet.extra')}</span>
            <p className="text-muted-foreground">{describeConditions(extras, t)}</p>
          </div>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('rules.sheet.age')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {AGES.map((value) => (
              <Choice key={value} name={`${id}-age`} value={value} current={age} onChange={setAge}>
                {t(`rules.sheet.ages.${value || 'none'}`)}
              </Choice>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('rules.sheet.then')}</legend>
          {actions.map((value) => (
            <Choice key={value} name={`${id}-action`} value={value} current={action} onChange={setAction}>
              {t(`rules.action.${value}`)}
            </Choice>
          ))}
        </fieldset>
        {needsLabel && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-label`} className="text-sm font-medium">{t('rules.sheet.label')}</label>
            <select
              id={`${id}-label`}
              required
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
              className="h-11 rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm"
            >
              <option value="">{t('rules.sheet.pickLabel')}</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('rules.sheet.schedule')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {schedules.map((value) => (
              <Choice key={value} name={`${id}-schedule`} value={value} current={schedule} onChange={setSchedule}>
                {t(`rules.schedule.${value || 'manual'}`)}
              </Choice>
            ))}
          </div>
        </fieldset>
        <div className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox id={`${id}-apply`} checked={applyExisting} onCheckedChange={(v) => setApplyExisting(!!v)} />
          <label htmlFor={`${id}-apply`}>{t('rules.sheet.applyExisting')}</label>
        </div>
        <Preview preview={preview} empty={!targeted} onNavigate={onClose} />
      </div>
      <SheetFooter className="pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button type="submit" className="h-11 md:h-9" disabled={pending || !valid}>{t(rule ? 'rules.sheet.save' : 'rules.sheet.create')}</Button>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onClose}>{t('common.cancel')}</Button>
      </SheetFooter>
    </form>
  )
}
