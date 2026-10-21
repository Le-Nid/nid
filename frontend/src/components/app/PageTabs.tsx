import type { ReactNode } from 'react'
import { Tabs } from 'radix-ui'

/** Secondary tabs of a page (§3.3: the tab lives in the URL, the caller maps `value`/`onChange` to `?tab=`). */
export function PageTabs({ value, onChange, label, tabs }: Readonly<{
  value: string
  onChange: (value: string) => void
  label: string
  tabs: { key: string; label: ReactNode; content: ReactNode }[]
}>) {
  return (
    <Tabs.Root value={value} onValueChange={onChange} className="flex flex-col gap-4">
      <Tabs.List aria-label={label} className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.key}
            value={tab.key}
            className="-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=active]:border-primary data-[state=active]:text-foreground"
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Content key={tab.key} value={tab.key} className="focus-visible:outline-none">{tab.content}</Tabs.Content>
      ))}
    </Tabs.Root>
  )
}
