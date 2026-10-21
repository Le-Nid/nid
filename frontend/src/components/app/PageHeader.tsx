import type { ReactNode } from 'react'

/** Top of a page (§5.2): its only h1, an optional description and actions; stacks below md. */
export function PageHeader({ title, description, actions }: Readonly<{ title: string; description?: ReactNode; actions?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] md:text-2xl">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
