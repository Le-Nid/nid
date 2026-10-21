import { useEffect, useRef } from 'react'

// Typing places and widgets with their own keys (menu typeahead, dialogs) keep every key
const OWNS_KEYS = 'input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"], [role="listbox"]'

/**
 * Single-key shortcuts (`{ j: next, '#': trash }`), off when `enabled` is false (WCAG 2.1.4, R3).
 * Never fires with Ctrl/Meta/Alt (browser and OS shortcuts) nor while typing; Enter is never a shortcut,
 * so it keeps activating the focused button.
 */
export function useKeyboardShortcuts(handlers: Record<string, () => void>, enabled: boolean) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      const target = e.target as HTMLElement
      if (target.isContentEditable || target.closest?.(OWNS_KEYS)) return
      const handler = ref.current[e.key]
      if (!handler) return
      e.preventDefault()
      handler()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
