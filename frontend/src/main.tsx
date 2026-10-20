import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useTranslation } from 'react-i18next'
import './store/theme.store' // applies the .dark class before the first render
import { ErrorBoundary } from './components/ErrorBoundary'
import { createLogger } from './utils/logger'
import { registerSW } from 'virtual:pwa-register'
import AppRouter from './App'
import './i18n'
import './index.css'

const logger = createLogger('app')

// Global unhandled error / rejection logging
window.addEventListener('error', (event) => {
  logger.error('Unhandled error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', {
    reason: String(event.reason),
  })
})

registerSW({ immediate: true })

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

// <html lang> suit la langue i18n
function ThemedApp() {
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'fr'

  React.useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemedApp />
    </BrowserRouter>
  </React.StrictMode>
)
