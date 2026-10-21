import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

afterEach(() => { document.body.innerHTML = '' })

describe('useKeyboardShortcuts', () => {
  it('runs the handler of the pressed key and prevents its default', () => {
    const j = vi.fn()
    renderHook(() => useKeyboardShortcuts({ j }, true))
    expect(press('j').defaultPrevented).toBe(true)
    expect(j).toHaveBeenCalledOnce()
    expect(press('x').defaultPrevented).toBe(false)
  })

  it('ignores Ctrl, Meta and Alt combinations', () => {
    const k = vi.fn()
    renderHook(() => useKeyboardShortcuts({ k }, true))
    press('k', { ctrlKey: true })
    press('k', { metaKey: true })
    press('k', { altKey: true })
    expect(k).not.toHaveBeenCalled()
  })

  it('ignores typing in fields, contenteditable and menus', () => {
    const e = vi.fn()
    renderHook(() => useKeyboardShortcuts({ e }, true))
    document.body.innerHTML = '<input id="i"><div id="c" contenteditable="true"></div><div role="menu"><span id="m"></span></div>'
    press('e', {}, document.getElementById('i')!)
    const editable = document.getElementById('c')!
    Object.defineProperty(editable, 'isContentEditable', { value: true }) // jsdom does not compute it
    press('e', {}, editable)
    press('e', {}, document.getElementById('m')!)
    expect(e).not.toHaveBeenCalled()
  })

  it('leaves Enter to the focused button', () => {
    renderHook(() => useKeyboardShortcuts({ o: vi.fn() }, true))
    document.body.innerHTML = '<button id="b">Ouvrir</button>'
    expect(press('Enter', {}, document.getElementById('b')!).defaultPrevented).toBe(false)
  })

  it('does nothing when disabled, and uses the latest handlers', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ h, on }) => useKeyboardShortcuts({ j: h }, on), { initialProps: { h: first, on: false } })
    press('j')
    expect(first).not.toHaveBeenCalled()
    rerender({ h: second, on: true })
    press('j')
    expect(second).toHaveBeenCalledOnce()
  })
})
