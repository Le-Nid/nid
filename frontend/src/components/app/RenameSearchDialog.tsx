import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/app/FormField'
import type { SavedSearch } from './SearchBar'

/** « Renommer » a saved search: its name only, the query stays. */
export function RenameSearchDialog({ search, pending, onClose, onSubmit }: Readonly<{
  search: SavedSearch | null; pending: boolean; onClose: () => void; onSubmit: (name: string) => void
}>) {
  const { t } = useTranslation()
  const id = useId()
  const [name, setName] = useState('')
  const [shown, setShown] = useState<SavedSearch | null>(null)
  if (search !== shown) {
    // Opened on another search: start from its current name
    setShown(search)
    setName(search?.name ?? '')
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onSubmit(name.trim())
  }

  return (
    <Dialog open={!!search} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('searchBar.renameTitle')}</DialogTitle>
          </DialogHeader>
          <FormField id={`${id}-name`} label={t('searchBar.name')}>
            <Input
              id={`${id}-name`}
              autoComplete="off"
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 text-base md:h-9 md:text-sm"
            />
          </FormField>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" className="h-11 md:h-9" disabled={!name.trim() || name.trim() === search?.name || pending}>
              {t('searchBar.rename')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
