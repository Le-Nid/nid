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
})
