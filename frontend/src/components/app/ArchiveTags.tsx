import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useArchiveTags, useTagArchived } from '@/hooks/queries'
import { cn } from '@/lib/utils'

/** « factures, impôts » → ['factures', 'impôts']: trimmed, cut at the API's 50 characters, no empty or repeated tag. */
export const parseTags = (text: string) => [...new Set(text.split(',').map((s) => s.trim().slice(0, 50).trim()).filter(Boolean))]

/** The account's tags, offered as suggestions to an input with `list={id}`. */
export function TagSuggestions({ id, accountId }: Readonly<{ id: string; accountId: string }>) {
  const tags = useArchiveTags(accountId).data ?? []
  return <datalist id={id}>{tags.map(({ tag }) => <option key={tag} value={tag} />)}</datalist>
}

/** Tags of one archived mail in the reader: remove one, or type new ones. Nid only, Gmail never sees them. */
export function ArchiveTagEditor({ accountId, mailId, tags, readOnly }: Readonly<{ accountId: string; mailId: string; tags: string[]; readOnly?: boolean }>) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState('')
  const tag = useTagArchived(accountId)
  const change = (patch: { add?: string[]; remove?: string[] }) =>
    tag.mutate({ mailIds: [mailId], ...patch }, { onError: () => toast.error(t('archives.tags.failed')) })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const add = parseTags(draft)
    if (!add.length) return
    change({ add })
    setDraft('')
  }

  if (readOnly && !tags.length) return null
  return (
    <section aria-label={t('archives.tags.title')} className="flex flex-wrap items-center gap-1 border-b px-4 py-2">
      <Tag aria-hidden="true" className="size-4 text-muted-foreground" />
      {tags.map((name) => (
        <span key={name} className={cn('inline-flex h-[22px] items-center gap-0.5 rounded-full border pl-2 text-xs font-medium', readOnly && 'pr-2')}>
          {name}
          {!readOnly && <Button
            variant="ghost"
            size="icon"
            className="size-[22px] rounded-full"
            aria-label={t('archives.tags.remove', { tag: name })}
            disabled={tag.isPending}
            onClick={() => change({ remove: [name] })}
          >
            <X aria-hidden="true" className="size-3" />
          </Button>}
        </span>
      ))}
      {!readOnly && <form onSubmit={submit} className="min-w-32 flex-1">
        <Input
          aria-label={t('archives.tags.add')}
          placeholder={t('archives.tags.addPlaceholder')}
          list={`${id}-tags`}
          maxLength={200}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-11 border-none text-base shadow-none md:h-7 md:text-sm"
        />
        <TagSuggestions id={`${id}-tags`} accountId={accountId} />
      </form>}
    </section>
  )
}
