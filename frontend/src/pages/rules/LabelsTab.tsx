import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Ellipsis, Plus, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { LabelBadge } from '@/components/app/LabelBadge'
import { userLabels, type RuleSheetTarget } from '@/components/app/RuleSheet'
import {
  useCreateLabel, useCreateRuleFromTemplate, useDeleteLabel, useLabels, useRules, useRuleTemplates, useUpdateLabel,
} from '@/hooks/queries'
import type { ApiLabel } from '@/utils/gmail'
import type { Rule, RuleTemplate } from '@/types/rules'
import { cn } from '@/lib/utils'

const CATEGORIES = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS']
// A few pairs of Gmail's label palette: the API rejects any other color
const COLORS: [name: string, backgroundColor: string, textColor: string][] = [
  ['red', '#fb4c2f', '#ffffff'], ['orange', '#ffad47', '#000000'], ['yellow', '#fad165', '#000000'],
  ['green', '#16a766', '#ffffff'], ['teal', '#43d692', '#000000'], ['blue', '#4a86e8', '#ffffff'],
  ['purple', '#a479e2', '#ffffff'], ['pink', '#f691b3', '#000000'], ['gray', '#cccccc', '#000000'],
]
const PRIMARY_TEMPLATES = new Set(['label', 'expire'])

type Node = { name: string; path: string; label?: ApiLabel; children: Node[] }
type Dialogs = { kind: 'new' } | { kind: 'rename' | 'color' | 'delete'; label: ApiLabel } | null

/** Gmail nests labels by « / » in their name (« Factures/EDF »). */
export function buildTree(labels: ApiLabel[]): Node[] {
  const root: Node = { name: '', path: '', children: [] }
  for (const label of [...labels].sort((a, b) => a.name.localeCompare(b.name))) {
    let node = root
    label.name.split('/').forEach((part, i, parts) => {
      const path = parts.slice(0, i + 1).join('/')
      let child = node.children.find((c) => c.path === path)
      if (!child) node.children.push((child = { name: part, path, children: [] }))
      node = child
    })
    node.label = label
  }
  return root.children
}

const mailsQuery = (name: string) => `/mails?q=${encodeURIComponent(`label:${/\s/.test(name) ? `"${name}"` : name}`)}`

function LabelMenu({ label, open, onCreateRule }: Readonly<{ label: ApiLabel; open: (d: Dialogs) => void; onCreateRule: (t: RuleSheetTarget) => void }>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const item = 'min-h-11 md:min-h-8'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={t('rules.labelsTab.menu', { name: label.name })}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className={item} onSelect={() => open({ kind: 'rename', label })}>{t('rules.labelsTab.rename')}</DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => open({ kind: 'color', label })}>{t('rules.labelsTab.color')}</DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onCreateRule({ labelId: label.id })}>{t('rules.labelsTab.createRule')}</DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => navigate(mailsQuery(label.name))}>{t('rules.labelsTab.viewMails')}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className={item} onSelect={() => open({ kind: 'delete', label })}>{t('rules.labelsTab.delete')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Tree({ nodes, open, onCreateRule }: Readonly<{ nodes: Node[]; open: (d: Dialogs) => void; onCreateRule: (t: RuleSheetTarget) => void }>) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <li key={node.path}>
          <div className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted md:min-h-9">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px] bg-muted-foreground"
              style={node.label?.color_bg ? { backgroundColor: node.label.color_bg } : undefined}
            />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {node.label && (
              <>
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {t('rules.labelsTab.count', { count: node.label.archived_count ?? 0 })}
                </span>
                <LabelMenu label={node.label} open={open} onCreateRule={onCreateRule} />
              </>
            )}
          </div>
          {node.children.length > 0 && (
            <div className="ml-3 border-l pl-3">
              <Tree nodes={node.children} open={open} onCreateRule={onCreateRule} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function NameDialog({ open, title, initial, onClose, onSubmit }: Readonly<{
  open: boolean
  title: string
  initial: string
  onClose: () => void
  onSubmit: (name: string) => void
}>) {
  const { t } = useTranslation()
  const id = useId()
  const [name, setName] = useState(initial)
  const [prev, setPrev] = useState({ open, initial })
  if (prev.open !== open || prev.initial !== initial) {
    setPrev({ open, initial })
    setName(initial)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onSubmit(name.trim())
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription id={`${id}-hint`}>{t('rules.labelsTab.nameHint')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">{t('rules.labelsTab.name')}</label>
            <Input id={id} required maxLength={225} aria-describedby={`${id}-hint`} value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base md:h-9 md:text-sm" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" className="h-11 md:h-9">{t('common.cancel')}</Button></DialogClose>
            <Button type="submit" className="h-11 md:h-9" disabled={!name.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ColorDialog({ label, onClose, onPick }: Readonly<{ label: ApiLabel | null; onClose: () => void; onPick: (bg: string, fg: string) => void }>) {
  const { t } = useTranslation()
  return (
    <Dialog open={!!label} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('rules.labelsTab.colorTitle', { name: label?.name })}</DialogTitle>
          <DialogDescription>{t('rules.labelsTab.colorHint')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {COLORS.map(([name, bg, fg]) => {
            const current = label?.color_bg?.toLowerCase() === bg
            return (
              <button
                key={name}
                type="button"
                aria-label={t(`rules.labelsTab.colors.${name}`)}
                aria-pressed={current}
                onClick={() => onPick(bg, fg)}
                className={cn('size-11 rounded-full border-2 border-transparent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:size-9', current && 'border-foreground')}
                style={{ backgroundColor: bg }}
              />
            )
          })}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" className="h-11 md:h-9">{t('common.cancel')}</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplateCard({ template, rule, onApply, onEdit, busy }: Readonly<{
  template: RuleTemplate
  rule?: Rule
  onApply: () => void
  onEdit: (rule: Rule) => void
  busy: boolean
}>) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 id={id} className="font-medium">{template.name}</h3>
        {rule && <span className="shrink-0 rounded-full bg-success-soft px-2 text-xs leading-[22px] font-medium text-success">{t('rules.labelsTab.active')}</span>}
      </div>
      <p className="flex-1 text-sm text-muted-foreground">{template.description}</p>
      {rule ? (
        <Button variant="outline" className="h-11 self-start md:h-8" aria-describedby={id} onClick={() => onEdit(rule)}>{t('rules.labelsTab.editRule')}</Button>
      ) : (
        <Button variant="outline" className="h-11 self-start md:h-8" aria-describedby={id} disabled={busy} onClick={onApply}>
          {t(template.label ? 'rules.labelsTab.createBoth' : 'rules.labelsTab.activate')}
        </Button>
      )}
    </li>
  )
}

function Templates({ accountId, onEdit }: Readonly<{ accountId: string; onEdit: (target: RuleSheetTarget) => void }>) {
  const { t } = useTranslation()
  const templates: RuleTemplate[] = useRuleTemplates().data ?? []
  const rules: Rule[] = useRules(accountId).data ?? []
  const fromTemplate = useCreateRuleFromTemplate(accountId)
  const apply = (template: RuleTemplate) => fromTemplate.mutate(template.id, {
    onSuccess: () => toast.success(t('rules.labelsTab.templateApplied', { name: template.name })),
    onError: () => toast.error(t('rules.labelsTab.templateFailed')),
  })
  const grid = (list: RuleTemplate[]) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((tpl) => (
        <TemplateCard
          key={tpl.id}
          template={tpl}
          rule={rules.find((r) => r.template_id === tpl.id)}
          busy={fromTemplate.isPending}
          onApply={() => apply(tpl)}
          onEdit={(rule) => onEdit({ rule })}
        />
      ))}
    </ul>
  )
  const primary = templates.filter((tpl) => PRIMARY_TEMPLATES.has(tpl.category))
  const others = templates.filter((tpl) => !PRIMARY_TEMPLATES.has(tpl.category))
  return (
    <section aria-labelledby="templates-title" className="flex flex-col gap-3">
      <div>
        <h2 id="templates-title" className="text-lg font-semibold">{t('rules.labelsTab.templates')}</h2>
        <p className="text-sm text-muted-foreground">{t('rules.labelsTab.templatesHint')}</p>
      </div>
      {grid(primary)}
      {others.length > 0 && (
        <>
          <h3 className="pt-2 font-medium">{t('rules.labelsTab.otherTemplates')}</h3>
          {grid(others)}
        </>
      )}
    </section>
  )
}

/** « Libellés » tab (§7.9, artboard 19): Gmail labels tree, categories, templates. */
export function LabelsTab({ accountId, onEdit }: Readonly<{ accountId: string; onEdit: (target: RuleSheetTarget) => void }>) {
  const { t } = useTranslation()
  const labels = useLabels(accountId)
  const create = useCreateLabel(accountId)
  const update = useUpdateLabel(accountId)
  const remove = useDeleteLabel(accountId)
  const [dialog, setDialog] = useState<Dialogs>(null)
  const close = () => setDialog(null)
  const target = dialog && 'label' in dialog ? dialog.label : null
  const done = (key: string) => ({
    onSuccess: () => toast.success(t(`rules.labelsTab.${key}`)),
    onError: () => toast.error(t('rules.labelsTab.failed')),
  })
  const tree = buildTree(userLabels(labels.data ?? []))

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="gmail-labels-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="gmail-labels-title" className="text-lg font-semibold">{t('rules.labelsTab.gmail')}</h2>
          <Button variant="outline" className="h-11 md:h-9" onClick={() => setDialog({ kind: 'new' })}>
            <Plus aria-hidden="true" />{t('rules.labelsTab.new')}
          </Button>
        </div>
        {labels.isError && (
          <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
            <span className="flex-1">{t('rules.labelsTab.loadError')}</span>
            <Button variant="outline" onClick={() => void labels.refetch()}>{t('mails.retry')}</Button>
          </div>
        )}
        {!labels.isLoading && !labels.isError && tree.length === 0 && <EmptyState icon={<Tag />} title={t('rules.labelsTab.empty')} />}
        <Tree nodes={tree} open={setDialog} onCreateRule={onEdit} />
      </section>

      <section aria-labelledby="categories-title" className="flex flex-col gap-3">
        <div>
          <h2 id="categories-title" className="text-lg font-semibold">{t('rules.labelsTab.categories')}</h2>
          <p className="text-sm text-muted-foreground">{t('rules.labelsTab.categoriesHint')}</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {CATEGORIES.map((name) => <li key={name}><LabelBadge label={{ name, type: 'system' }} /></li>)}
        </ul>
      </section>

      <Templates accountId={accountId} onEdit={onEdit} />

      <NameDialog
        open={dialog?.kind === 'new' || dialog?.kind === 'rename'}
        title={dialog?.kind === 'rename' ? t('rules.labelsTab.renameTitle', { name: dialog.label.name }) : t('rules.labelsTab.newTitle')}
        initial={dialog?.kind === 'rename' ? dialog.label.name : ''}
        onClose={close}
        onSubmit={(name) => {
          if (dialog?.kind === 'rename') update.mutate({ labelId: dialog.label.id, name }, done('renamed'))
          else create.mutate(name, done('created'))
          close()
        }}
      />
      <ColorDialog
        label={dialog?.kind === 'color' ? dialog.label : null}
        onClose={close}
        onPick={(backgroundColor, textColor) => {
          update.mutate({ labelId: target!.id, color: { backgroundColor, textColor } }, done('colored'))
          close()
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(o) => !o && close()}
        title={t('rules.labelsTab.deleteTitle', { name: target?.name })}
        description={t('rules.labelsTab.deleteDescription')}
        confirmLabel={t('rules.labelsTab.deleteAction')}
        destructive
        onConfirm={() => target && remove.mutate(target.id, done('deleted'))}
      />
    </div>
  )
}
