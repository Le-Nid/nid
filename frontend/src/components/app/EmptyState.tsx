import type { ReactNode } from 'react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

/** Empty list or page, always with a way forward (I1, §6.5): `action` is a real button or link. */
export function EmptyState({ icon, title, description, action }: Readonly<{
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
}>) {
  return (
    <Empty>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon" aria-hidden="true">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
