import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ConfigProvider, theme as antTheme, App as AntApp } from 'antd'
import frFR from 'antd/locale/fr_FR'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from './store/theme.store'
import AppRouter from './App'
import './i18n'
import './index.css'

// Service Worker registration (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — app works fine without it
    })
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 min — same TTL as the old manual cache
      gcTime: 10 * 60 * 1000,      // 10 min garbage collection
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const antLocales = { fr: frFR, en: enUS } as Record<string, typeof frFR>

// Wrapper pour lire le store Zustand DANS l'arbre React
function ThemedApp() {
  const mode = useThemeStore((s) => s.mode)
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'fr'

  // Set <html lang> dynamically
  React.useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <ConfigProvider
      locale={antLocales[lang] ?? frFR}
      theme={{
        algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary:  '#1677ff',
          borderRadius:  8,
          // En dark mode, adoucir légèrement le fond des cards
          ...(mode === 'dark' && {
            colorBgContainer: '#1e1e1e',
            colorBgBase:      '#141414',
          }),
        },
        components: {
          Layout: {
            siderBg:    mode === 'dark' ? '#141414' : '#fff',
            headerBg:   mode === 'dark' ? '#141414' : '#fff',
          },
          Menu: {
            darkItemBg: '#141414',
          },
        },
      }}
    >
      {/* AntApp injecte les méthodes message/notification/modal dans le contexte */}
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AppRouter />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemedApp />
    </BrowserRouter>
  </React.StrictMode>
)
