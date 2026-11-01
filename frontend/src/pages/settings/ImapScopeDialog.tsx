import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/app/FormField'
import { LoadError } from '@/components/app/LoadError'
import { useImapFolders, useSetImapScope } from '@/hooks/queries'
import type { GmailAccount } from '@/store/auth.store'
import type { ImapFolders } from '@/api'

/** The form, once the server's folders are known (its state starts from what the backup covers today). */
function ScopeForm({ formId, data, onSave }: Readonly<{
  formId: string
  data: ImapFolders
  onSave: (folders: string[] | null, since: string | null) => void
}>) {
  const { t } = useTranslation()
  const [all, setAll] = useState(data.chosen === null)
  const [chosen, setChosen] = useState(() => new Set(data.chosen ?? data.folders.filter((f) => f.syncedByDefault).map((f) => f.path)))
  const [since, setSince] = useState(data.since ?? '')
  const toggle = (path: string, on: boolean) => setChosen((prev) => {
    const next = new Set(prev)
    if (on) next.add(path)
    else next.delete(path)
    return next
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    // Kept in the server's order
    onSave(all ? null : data.folders.map((f) => f.path).filter((p) => chosen.has(p)), since || null)
  }

  return (
    <form id={formId} onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      {/* min-w-0: a fieldset is min-content wide by default, a long folder name would widen the dialog */}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('settings.imap.scope.folders')}</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-0">
          <input type="radio" name={`${formId}-all`} checked={all} onChange={() => setAll(true)} className="size-4 accent-primary" />
          {t('settings.imap.scope.all')}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-0">
          <input type="radio" name={`${formId}-all`} checked={!all} onChange={() => setAll(false)} className="size-4 accent-primary" />
          {t('settings.imap.scope.some')}
        </label>
        {!all && (
          <ul className="ml-7 flex max-h-64 min-w-0 flex-col gap-1 overflow-y-auto">
            {data.folders.map((f) => (
              <li key={f.path}>
                <label className="flex min-h-11 min-w-0 items-center gap-3 text-sm md:min-h-0">
                  <Checkbox checked={chosen.has(f.path)} onCheckedChange={(v) => toggle(f.path, v === true)} />
                  <span className="truncate" title={f.path}>{f.path}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <FormField id={`${formId}-since`} label={t('settings.imap.scope.since')}>
        <Input
          id={`${formId}-since`}
          type="date"
          value={since}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setSince(e.target.value)}
          className="h-11 text-base md:h-9 md:w-48 md:text-sm"
        />
      </FormField>
      <p className="text-sm text-muted-foreground">{t('settings.imap.scope.sinceHint')}</p>
      {!all && chosen.size === 0 && <p role="alert" className="text-sm text-destructive">{t('settings.imap.scope.none')}</p>}
    </form>
  )
}

/** « Dossiers et période » of an IMAP account: which folders its backup covers, and from which day. */
export function ImapScopeDialog({ account, onClose }: Readonly<{ account: GmailAccount; onClose: () => void }>) {
  const { t } = useTranslation()
  const formId = useId()
  const folders = useImapFolders(account.id)
  const save = useSetImapScope(account.id)
  const onSave = (chosen: string[] | null, since: string | null) => {
    if (chosen?.length === 0) return
    save.mutate({ folders: chosen, since }, {
      onSuccess: () => {
        toast.success(t('settings.imap.scope.saved'))
        onClose()
      },
      onError: () => toast.error(t('settings.saveFailed')),
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.imap.scope.title')}</DialogTitle>
          <DialogDescription>{t('settings.imap.scope.description', { email: account.email })}</DialogDescription>
        </DialogHeader>
        {folders.isError && <LoadError message={t('settings.imap.scope.loadError')} onRetry={() => void folders.refetch()} />}
        {folders.isLoading && <p className="text-sm text-muted-foreground">{t('settings.imap.scope.loading')}</p>}
        {folders.data && <ScopeForm formId={formId} data={folders.data} onSave={onSave} />}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 md:h-9" disabled={save.isPending} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} className="h-11 md:h-9" disabled={!folders.data || save.isPending}>{t('settings.imap.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
