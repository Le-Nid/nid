import { useEffect, useCallback } from 'react'

interface KeyboardShortcutsOptions {
  mails: { id: string }[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  onViewMail: (id: string) => void
  onAction: (action: string) => void
  onSearch: () => void
  enabled: boolean
}

export function useKeyboardShortcuts({
  mails,
  selectedIndex,
  onSelectIndex,
  onViewMail,
  onAction,
  onSearch,
  enabled,
}: KeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      // Ignore if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

      switch (e.key) {
        case 'j': // Next mail
          e.preventDefault()
          if (selectedIndex < mails.length - 1) {
            onSelectIndex(selectedIndex + 1)
          }
          break

        case 'k': // Previous mail
          e.preventDefault()
          if (selectedIndex > 0) {
            onSelectIndex(selectedIndex - 1)
          }
          break

        case 'Enter': // Open mail
        case 'o':
          e.preventDefault()
          if (mails[selectedIndex]) {
            onViewMail(mails[selectedIndex].id)
          }
          break

        case 'e': // Archive
          e.preventDefault()
          onAction('archive')
          break

        case '#': // Trash
          e.preventDefault()
          onAction('trash')
          break

        case 'r': // Mark read
          e.preventDefault()
          onAction('mark_read')
          break

        case 'u': // Mark unread
          e.preventDefault()
          onAction('mark_unread')
          break

        case '/': // Focus search
          e.preventDefault()
          onSearch()
          break

        case 'Escape':
          e.preventDefault()
          onSelectIndex(-1)
          break

        default:
          break
      }
    },
    [enabled, mails, selectedIndex, onSelectIndex, onViewMail, onAction, onSearch],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
