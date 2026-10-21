import type { ReactNode } from 'react'

/** Visible label over its control (§6.8); `id` is the control's. */
export function FormField({ id, label, children }: Readonly<{ id: string; label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
