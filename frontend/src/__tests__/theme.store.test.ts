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
})
