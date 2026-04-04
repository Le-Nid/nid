/// <reference lib="webworker" />

// Service Worker — Nid PWA
// Stratégie : Network-first pour les requêtes API, Cache-first pour les assets statiques

const SW_VERSION = '1.0.0'
const CACHE_NAME = `nid-cache-v${SW_VERSION}`
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/nid-favicon-light.svg',
  '/nid-favicon-dark.svg',
  '/nid-logomark-light.svg',
  '/nid-logomark-dark.svg',
]

declare const self: ServiceWorkerGlobalScope

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  // Activer immédiatement sans attendre les onglets existants
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  // Prendre le contrôle de tous les clients immédiatement
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ne pas intercepter les requêtes cross-origin
  if (url.origin !== self.location.origin) return

  // Requêtes API → network-only (pas de cache pour les données)
  if (url.pathname.startsWith('/api/')) return

  // SSE → ne pas intercepter
  if (request.headers.get('accept')?.includes('text/event-stream')) return

  // Assets statiques (JS, CSS, images) → cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|eot|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Navigation (HTML) → network-first, fallback au cache pour l'app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match('/').then((r) => r || new Response('Offline', { status: 503 })))
    )
    return
  }
})
