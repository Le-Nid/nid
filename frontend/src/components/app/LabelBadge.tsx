import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** A Gmail label as `GET /api/gmail/:id/labels` returns it (L1); categories are system labels named CATEGORY_*. */
export type GmailLabel = { name: string; type: 'system' | 'user'; color?: string | null }

// Verified fg/bg pairs, light and dark (§4.1, L2)
const CATEGORY_CLASSES: Record<string, string> = {
  CATEGORY_PROMOTIONS: 'bg-cat-promotions-bg text-cat-promotions-fg',
  CATEGORY_SOCIAL: 'bg-cat-social-bg text-cat-social-fg',
  CATEGORY_UPDATES: 'bg-cat-updates-bg text-cat-updates-fg',
  CATEGORY_FORUMS: 'bg-cat-forums-bg text-cat-forums-fg',
}

const BADGE = 'inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full px-2 text-xs font-medium'

/**
 * R2: a user label is a Gmail-colored dot + foreground text (the color is never the text's);
 * a category is a translated colored badge. Other system labels (INBOX, UNREAD…) are mail state, not shown.
 */
export function LabelBadge({ label }: Readonly<{ label: GmailLabel }>) {
  const { t } = useTranslation()

  if (label.type === 'user') {
    return (
      <span className={cn(BADGE, 'border text-foreground')}>
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-[3px] bg-muted-foreground"
          style={label.color ? { backgroundColor: label.color } : undefined}
        />
        <span className="truncate">{label.name}</span>
      </span>
    )
  }

  const colors = CATEGORY_CLASSES[label.name]
  if (!colors) return null
  return <span className={cn(BADGE, colors)}>{t(`labels.${label.name}`)}</span>
}
