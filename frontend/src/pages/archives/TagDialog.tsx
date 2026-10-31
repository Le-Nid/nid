import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/app/FormField'
import { parseTags, TagSuggestions } from '@/components/app/ArchiveTags'
import { useTagArchived } from '@/hooks/queries'

/** « Tags » on a selection of archives: add or remove the typed tags on every selected mail. */
export function TagDialog({ accountId, mailIds, onClose, onDone }: Readonly<{
  accountId: string; mailIds: string[] | null; onClose: () => void; onDone: () => void
}>) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState('')
  const tag = useTagArchived(accountId)
  const tags = parseTags(text)

  const apply = (mode: 'add' | 'remove') => {
    if (!mailIds) return
    tag.mutate({ mailIds, [mode]: tags }, {
      onSuccess: () => {
        toast.success(t(`archives.tags.${mode}ed`, { count: mailIds.length }))
        setText('')
        onDone()
      },
      onError: () => toast.error(t('archives.tags.failed')),
    })
  }

  return (
    <Dialog open={!!mailIds} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('archives.tags.title')}</DialogTitle>
          <DialogDescription>{t('archives.tags.description', { count: mailIds?.length ?? 0 })}</DialogDescription>
        </DialogHeader>
        <FormField id={`${id}-tags`} label={t('archives.tags.field')}>
          <Input
            id={`${id}-tags`}
            list={`${id}-list`}
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-11 text-base md:h-9 md:text-sm"
          />
        </FormField>
        <TagSuggestions id={`${id}-list`} accountId={accountId} />
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 md:h-9" disabled={!tags.length || tag.isPending} onClick={() => apply('remove')}>
            {t('archives.tags.removeAction')}
          </Button>
          <Button className="h-11 md:h-9" disabled={!tags.length || tag.isPending} onClick={() => apply('add')}>
            {t('archives.tags.addAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
