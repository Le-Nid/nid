import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: (localStorage.getItem('theme') as ThemeMode) ?? 'light',

  toggle: () => {
    const next = get().mode === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', next)
    set({ mode: next })
  },
}))
