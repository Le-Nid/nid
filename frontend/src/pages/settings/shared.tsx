import { useId, type ReactNode } from 'react'
import { Toggle } from '@/components/app/Toggle'

/** Content card of a settings section (§7.7: « contenu en cartes »); its h2 names the region. */
export function SettingsCard({ title, description, children }: Readonly<{ title: string; description?: ReactNode; children: ReactNode }>) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** One on/off setting: visible label (and hint) bound to its switch. */
export function SwitchRow({ label, description, checked, onChange, disabled }: Readonly<{
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}>) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {description && <span id={`${id}-hint`} className="text-sm text-muted-foreground">{description}</span>}
      </div>
      <Toggle id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-describedby={description ? `${id}-hint` : undefined} />
    </div>
  )
}

/** Slugs of /settings/:section (§7.7), in tab order; « Plus » lists them too. */
export const SETTINGS_SECTIONS = ['account', 'security', 'gmail', 'notifications', 'data', 'about'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** Same look as the shadcn Input, for native selects (mobile pickers, no extra dependency). */
export const selectClass = 'h-11 rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm'
