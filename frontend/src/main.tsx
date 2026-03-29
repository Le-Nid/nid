import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme as antTheme, App as AntApp } from 'antd'
import frFR from 'antd/locale/fr_FR'
import { useThemeStore } from './store/theme.store'
import AppRouter from './App'
import './index.css'

// Wrapper pour lire le store Zustand DANS l'arbre React
function ThemedApp() {
  const mode = useThemeStore((s) => s.mode)

  return (
    <ConfigProvider
      locale={frFR}
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
        <AppRouter />
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
