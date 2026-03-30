import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target:       process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },

  build: {
    target:     'es2022',
    sourcemap:  true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) attend une fonction ici.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router-dom/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('/antd/') || id.includes('/@ant-design/icons/')) {
            return 'antd-vendor'
          }

          if (id.includes('/@ant-design/charts/') || id.includes('/@antv/')) {
            return 'charts'
          }

          if (id.includes('/axios/') || id.includes('/dayjs/') || id.includes('/zustand/')) {
            return 'utils'
          }

          return undefined
        },
      },
    },
  },

  // Vitest — inlined dans vite.config pour éviter un fichier supplémentaire
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude:  ['dist/**', 'src/__tests__/**'],
    },
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  },
} as any)
