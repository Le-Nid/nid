import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  toggle: () => void
}

const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')
const systemMode = (): ThemeMode => (systemDark?.matches ? 'dark' : 'light')

export const useThemeStore = create<ThemeState>((set, get) => ({
  // No stored choice = follow the OS (prefers-color-scheme)
  mode: (localStorage.getItem('theme') as ThemeMode) ?? systemMode(),

  toggle: () => {
    const next = get().mode === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', next)
    set({ mode: next })
  },
}))

systemDark?.addEventListener?.('change', () => {
  if (!localStorage.getItem('theme')) useThemeStore.setState({ mode: systemMode() })
})
