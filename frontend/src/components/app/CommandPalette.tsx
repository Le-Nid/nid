import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CornerDownRight } from 'lucide-react'
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { useAuthStore } from '@/store/auth.store'
import { LEGACY_PAGES, visibleNav } from './nav'

/** ⌘K / Ctrl+K — navigation only in L0 (contextual actions come with their pages). */
export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t('shell.palette')} description={t('shell.paletteDescription')}>
      <Command>
        <CommandInput placeholder={t('shell.palettePlaceholder')} aria-label={t('shell.palettePlaceholder')} />
        <CommandList>
          <CommandEmpty>{t('shell.noResults')}</CommandEmpty>
          <CommandGroup heading={t('shell.goTo')}>
            {visibleNav(role).map((e) => (
              <CommandItem key={e.key} onSelect={() => go(e.to)}>
                <e.icon aria-hidden="true" />
                {t(`shell.${e.key}`)}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading={t('shell.legacyPages')}>
            {LEGACY_PAGES.map((p) => (
              <CommandItem key={p.to} onSelect={() => go(p.to)}>
                <CornerDownRight aria-hidden="true" />
                {t(p.labelKey)}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
