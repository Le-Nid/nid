import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useThemeStore } from '../store/theme.store'

describe('useThemeStore', () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    useThemeStore.setState({ mode: 'light' })
  })

  it('defaults to light mode', () => {
    expect(useThemeStore.getState().mode).toBe('light')
  })

  it('toggles to dark mode', () => {
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().mode).toBe('dark')
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark')
  })

  it('toggles back to light mode', () => {
    useThemeStore.setState({ mode: 'dark' })
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().mode).toBe('light')
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'light')
  })
  it('follows prefers-color-scheme when no theme is stored', async () => {
    vi.resetModules()
    vi.mocked(window.matchMedia).mockImplementationOnce((query: string) => ({ matches: true, media: query, addEventListener: vi.fn() }) as any)
    const { useThemeStore: fresh } = await import('../store/theme.store')
    expect(fresh.getState().mode).toBe('dark')
  })

  it('keeps following prefers-color-scheme until a theme is saved', async () => {
    vi.resetModules()
    let onChange = () => {}
    const mql = { matches: false, addEventListener: (_: string, l: () => void) => { onChange = l } }
    vi.mocked(window.matchMedia).mockImplementationOnce(() => mql as any)
    const { useThemeStore: fresh } = await import('../store/theme.store')
    expect(fresh.getState().mode).toBe('light')

    mql.matches = true
    onChange()
    expect(fresh.getState().mode).toBe('dark')

    vi.mocked(localStorage.getItem).mockReturnValue('dark')
    mql.matches = false
    onChange()
    expect(fresh.getState().mode).toBe('dark')
  })

  it('setPref stores light/dark and forgets the choice for system', () => {
    useThemeStore.getState().setPref('dark')
    expect(useThemeStore.getState()).toMatchObject({ pref: 'dark', mode: 'dark' })
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark')
    useThemeStore.getState().setPref('system')
    expect(useThemeStore.getState()).toMatchObject({ pref: 'system', mode: 'light' })
    expect(localStorage.removeItem).toHaveBeenCalledWith('theme')
  })

  it('puts the .dark class on <html> in dark mode', () => {
    useThemeStore.getState().toggle()
    expect(document.documentElement).toHaveClass('dark')
    useThemeStore.getState().toggle()
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
