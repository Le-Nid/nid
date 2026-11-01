import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type SavedSearch = { id: string; name: string; query: string }

// A Gmail term: operator (`from:x`, `-label:"a b"`), quoted phrase or word
const TERM = /-?[a-z_]+:(?:"[^"]*"|\S+)|"[^"]*"|\S+/gi
const OPERATOR = /^-?[a-z_]+:\S/i

function splitQuery(query: string) {
  const terms = query.match(TERM) ?? []
  return { tokens: terms.filter((s) => OPERATOR.test(s)), text: terms.filter((s) => !OPERATOR.test(s)).join(' ') }
}

/**
 * Gmail search (§5.2, P3): operators become removable tokens on Enter, the rest stays free text;
 * saved searches are chips above. `onChange` gets the whole query, on submit only.
 */
export function SearchBar({ value, onChange, saved = [], onSave }: Readonly<{
  value: string
  onChange: (query: string) => void
  saved?: SavedSearch[]
  onSave?: () => void
}>) {
  const { t } = useTranslation()
  const { tokens, text } = splitQuery(value)
  const [draft, setDraft] = useState(text)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    // Query changed from outside (saved chip, token removed): show its free text
    setSynced(value)
    setDraft(text)
  }

  const commit = (nextTokens: string[], nextText: string) =>
    onChange([...nextTokens, nextText.trim()].filter(Boolean).join(' '))
  const active = saved.find((s) => s.query === value)

  return (
    <div className="flex flex-col gap-2">
      {(saved.length > 0 || onSave) && (
        <div role="group" aria-label={t('searchBar.saved')} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {saved.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              aria-pressed={s === active}
              className="h-9 shrink-0 rounded-full px-3 aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-text md:h-8"
              onClick={() => onChange(s.query)}
            >
              {s.name}
            </Button>
          ))}
          {onSave && value && !active && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground md:h-8" onClick={onSave}>
              <Plus aria-hidden="true" />{t('searchBar.save')}
            </Button>
          )}
        </div>
      )}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          const typed = splitQuery(draft)
          commit([...tokens, ...typed.tokens], typed.text)
        }}
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
      >
        <Search className="size-4 text-muted-foreground" aria-hidden="true" />
        {tokens.map((tok, i) => (
          <span key={`${i}-${tok}`} className="inline-flex h-6 items-center gap-0.5 rounded-sm bg-muted pl-1.5 font-mono text-xs">
            {tok}
            <button
              type="button"
              aria-label={t('searchBar.removeFilter', { filter: tok })}
              className="grid size-6 place-items-center rounded-sm hover:bg-accent"
              onClick={() => commit(tokens.filter((_, j) => j !== i), draft)}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          type="search"
          aria-label={t('searchBar.label')}
          placeholder={t('searchBar.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 min-w-40 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground focus-visible:outline-none md:text-sm"
        />
      </form>
    </div>
  )
}
