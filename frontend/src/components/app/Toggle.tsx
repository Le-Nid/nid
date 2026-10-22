import type { ComponentProps } from 'react'
import { Switch } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * On/off switch (role="switch"). Named by a <label htmlFor={id}> or `aria-label`.
 * Hit area grown to 44 px (A1) around a 20 px track; z-10 keeps it above a DataList card's stretched button.
 */
export function Toggle({ className, ...props }: ComponentProps<typeof Switch.Root>) {
  return (
    <Switch.Root
      {...props}
      className={cn(
        'relative z-10 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input transition-colors before:absolute before:-inset-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 data-[state=checked]:bg-primary motion-reduce:transition-none',
        className,
      )}
    >
      <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-[18px] motion-reduce:transition-none" />
    </Switch.Root>
  )
}
