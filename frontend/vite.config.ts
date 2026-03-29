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
        // Découper antd + charts dans des chunks séparés
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-vendor':  ['antd', '@ant-design/icons'],
          'charts':       ['@ant-design/charts'],
          'utils':        ['axios', 'dayjs', 'zustand'],
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
