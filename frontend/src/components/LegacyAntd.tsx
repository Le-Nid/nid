import type { ReactNode } from 'react'
import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider, theme as antTheme, App as AntApp } from 'antd'
import frFR from 'antd/locale/fr_FR'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../store/theme.store'

/**
 * antd context for pages not yet migrated to shadcn (§9.1). Removed with antd in L10.
 * `layer`: antd styles go to @layer antd, ordered in index.css between Tailwind's preflight and utilities.
 */
export default function LegacyAntd({ children }: Readonly<{ children: ReactNode }>) {
  const mode = useThemeStore((s) => s.mode)
  const { i18n } = useTranslation()

  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={i18n.language?.startsWith('en') ? enUS : frFR}
        theme={{
          algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 8,
            // En dark mode, adoucir légèrement le fond des cards
            ...(mode === 'dark' && {
              colorBgContainer: '#1e1e1e',
              colorBgBase: '#141414',
            }),
          },
          components: {
            Layout: {
              siderBg: mode === 'dark' ? '#141414' : '#fff',
              headerBg: mode === 'dark' ? '#141414' : '#fff',
            },
            Menu: {
              darkItemBg: '#141414',
            },
          },
        }}
      >
        {/* AntApp injecte les méthodes message/notification/modal dans le contexte */}
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}
