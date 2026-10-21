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

// Tailwind/shadcn dark tokens (§4.5) and the browser chrome follow the same store as antd's algorithm
const apply = ({ mode }: ThemeState) => {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#09090b' : '#ffffff')
}
apply(useThemeStore.getState())
useThemeStore.subscribe(apply)

systemDark?.addEventListener?.('change', () => {
  if (!localStorage.getItem('theme')) useThemeStore.setState({ mode: systemMode() })
})
