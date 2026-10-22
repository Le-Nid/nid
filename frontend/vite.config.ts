import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // autoUpdate + registerSW() in main.tsx: a new build activates and reloads the tab, nobody stays on a stale bundle
      registerType: 'autoUpdate',
      manifest: {
        name: 'Nid',
        lang: 'fr',
        short_name: 'Nid',
        description: 'Gérez vos emails Gmail depuis votre propre serveur',
        start_url: '/',
        display: 'standalone',
        theme_color: '#ffffff', // light --background (§4.5); main.tsx switches the meta tag in dark mode
        background_color: '#ffffff',
        icons: [
          { src: '/nid-pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/nid-pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/nid-pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/nid-pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only (default js/css/html glob); /api is never served from the SW, and no runtimeCaching
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],

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
