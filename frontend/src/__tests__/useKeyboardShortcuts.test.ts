import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { renderHook } from '@testing-library/react'

function dispatchKey(key: string, target?: HTMLElement) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true })
  if (target) {
    Object.defineProperty(event, 'target', { value: target })
  }
  document.dispatchEvent(event)
}

describe('useKeyboardShortcuts', () => {
  const mails = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]
  let onSelectIndex: (index: number) => void
  let onViewMail: (id: string) => void
  let onAction: (action: string) => void
  let onSearch: () => void

  beforeEach(() => {
    onSelectIndex = vi.fn()
    onViewMail = vi.fn()
    onAction = vi.fn()
    onSearch = vi.fn()
  })

  function renderShortcuts(overrides: Record<string, any> = {}) {
    return renderHook(() =>
      useKeyboardShortcuts({
        mails,
        selectedIndex: 0,
        onSelectIndex,
        onViewMail,
        onAction,
        onSearch,
        enabled: true,
        ...overrides,
      }),
    )
  }

  it('j moves to next mail', () => {
    renderShortcuts({ selectedIndex: 0 })
    dispatchKey('j')
    expect(onSelectIndex).toHaveBeenCalledWith(1)
  })

  it('j does not move past last mail', () => {
    renderShortcuts({ selectedIndex: 2 })
    dispatchKey('j')
    expect(onSelectIndex).not.toHaveBeenCalled()
  })

  it('k moves to previous mail', () => {
    renderShortcuts({ selectedIndex: 1 })
    dispatchKey('k')
    expect(onSelectIndex).toHaveBeenCalledWith(0)
  })

  it('k does not move before first mail', () => {
    renderShortcuts({ selectedIndex: 0 })
    dispatchKey('k')
    expect(onSelectIndex).not.toHaveBeenCalled()
  })

  it('Enter opens current mail', () => {
    renderShortcuts({ selectedIndex: 1 })
    dispatchKey('Enter')
    expect(onViewMail).toHaveBeenCalledWith('m2')
  })

  it('o opens current mail', () => {
    renderShortcuts({ selectedIndex: 0 })
    dispatchKey('o')
    expect(onViewMail).toHaveBeenCalledWith('m1')
  })

  it('e triggers archive action', () => {
    renderShortcuts()
    dispatchKey('e')
    expect(onAction).toHaveBeenCalledWith('archive')
  })

  it('# triggers trash action', () => {
    renderShortcuts()
    dispatchKey('#')
    expect(onAction).toHaveBeenCalledWith('trash')
  })

  it('r triggers mark_read action', () => {
    renderShortcuts()
    dispatchKey('r')
    expect(onAction).toHaveBeenCalledWith('mark_read')
  })

  it('u triggers mark_unread action', () => {
    renderShortcuts()
    dispatchKey('u')
    expect(onAction).toHaveBeenCalledWith('mark_unread')
  })

  it('/ focuses search', () => {
    renderShortcuts()
    dispatchKey('/')
    expect(onSearch).toHaveBeenCalled()
  })

  it('Escape resets selection', () => {
    renderShortcuts({ selectedIndex: 2 })
    dispatchKey('Escape')
    expect(onSelectIndex).toHaveBeenCalledWith(-1)
  })

  it('does nothing when disabled', () => {
    renderShortcuts({ enabled: false })
    dispatchKey('j')
    dispatchKey('k')
    dispatchKey('e')
    expect(onSelectIndex).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('ignores keys when target is an input', () => {
    renderShortcuts()
    const input = document.createElement('INPUT')
    dispatchKey('j', input as HTMLElement)
    expect(onSelectIndex).not.toHaveBeenCalled()
  })

  it('ignores keys when target is a textarea', () => {
    renderShortcuts()
    const textarea = document.createElement('TEXTAREA')
    dispatchKey('j', textarea as HTMLElement)
    expect(onSelectIndex).not.toHaveBeenCalled()
  })
})
