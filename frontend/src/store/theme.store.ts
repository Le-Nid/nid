import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'
/** Choice in Paramètres > Compte; 'system' = nothing stored, follow the OS. */
export type ThemePref = ThemeMode | 'system'

interface ThemeState {
  mode: ThemeMode
  pref: ThemePref
  toggle: () => void
  setPref: (pref: ThemePref) => void
}

const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')
const systemMode = (): ThemeMode => (systemDark?.matches ? 'dark' : 'light')
const stored = localStorage.getItem('theme') as ThemeMode | null

export const useThemeStore = create<ThemeState>((set, get) => ({
  // No stored choice = follow the OS (prefers-color-scheme)
  mode: stored ?? systemMode(),
  pref: stored ?? 'system',

  toggle: () => get().setPref(get().mode === 'light' ? 'dark' : 'light'),

  setPref: (pref) => {
    if (pref === 'system') localStorage.removeItem('theme')
    else localStorage.setItem('theme', pref)
    set({ pref, mode: pref === 'system' ? systemMode() : pref })
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
