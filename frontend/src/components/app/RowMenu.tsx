import { Ellipsis } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type RowMenuItem = { key: string; label: string; onSelect: () => void; destructive?: boolean }

/** « … » menu of a DataList row; 44 px targets on mobile. */
export function RowMenu({ label, items }: Readonly<{ label: string; items: RowMenuItem[] }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={label}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.key} variant={item.destructive ? 'destructive' : 'default'} className="min-h-11 md:min-h-8" onSelect={item.onSelect}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
