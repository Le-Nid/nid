import { useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { ApiLabel } from '@/utils/gmail'

/** One row of the tree; `id` null = « Tous les mails ». */
export type LabelNode = { id: string | null; name: string; level: number; count?: number }

/** Display name of a synced label: system ones translated. */
export const labelName = (l: ApiLabel, t: TFunction) =>
  l.type === 'user' || l.type === 'imported' ? l.name : t(`labels.${l.id}`, { defaultValue: l.name })

/**
 * Labels that have archived mails, nested by « / » (« Factures / EDF » under « Factures »), after « Tous les mails ».
 * A child whose parent has no archives keeps the rest of its path.
 */
export function labelTreeNodes(labels: ApiLabel[], t: TFunction, total?: number): LabelNode[] {
  const archived = labels
    .filter((l) => (l.archived_count ?? 0) > 0)
    .map((l) => ({ id: l.id, path: labelName(l, t), count: l.archived_count }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const paths = new Set(archived.map((l) => l.path))
  const nodes = archived.map(({ id, path, count }) => {
    const parts = path.split('/')
    const ancestors = parts.slice(1).map((_, i) => parts.slice(0, i + 1).join('/')).filter((p) => paths.has(p))
    const parent = ancestors.at(-1)
    return { id, count, level: ancestors.length + 1, name: parent ? path.slice(parent.length + 1).trim() : path }
  })
  return [{ id: null, name: t('archives.allMails'), level: 1, count: total }, ...nodes]
}

/** Archive label tree (§5.2 LabelTree, desktop): `role="tree"`, arrows/Home/End move, Enter or Space selects. */
export function LabelTree({ nodes, value, onChange, label }: Readonly<{
  nodes: LabelNode[]
  value: string | null
  onChange: (id: string | null) => void
  label: string
}>) {
  const { i18n } = useTranslation()
  const items = useRef<(HTMLLIElement | null)[]>([])
  const selected = Math.max(0, nodes.findIndex((n) => n.id === value))

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: nodes.length - 1 }
    if (e.key in moves) {
      e.preventDefault()
      items.current[Math.min(Math.max(moves[e.key], 0), nodes.length - 1)]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange(nodes[i].id)
    }
  }

  return (
    <ul role="tree" aria-label={label} className="flex flex-col gap-0.5">
      {nodes.map((n, i) => (
        <li
          key={n.id ?? ''}
          ref={(el) => { items.current[i] = el }}
          role="treeitem"
          aria-level={n.level}
          aria-selected={i === selected}
          tabIndex={i === selected ? 0 : -1}
          onClick={() => onChange(n.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
          style={{ paddingLeft: `${0.5 + (n.level - 1)}rem` }}
          className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md pr-2 text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-selected:bg-primary-soft aria-selected:font-medium aria-selected:text-primary-text"
        >
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          {n.count !== undefined && <span className="text-xs tabular-nums">{n.count.toLocaleString(i18n.language)}</span>}
        </li>
      ))}
    </ul>
  )
}
