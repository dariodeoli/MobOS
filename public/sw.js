/* MobOS service worker — PWA shell offline.
   Estrategia:
   - Shell precacheado en install (navegación y marca).
   - Navegaciones: network-first con fallback al shell cacheado.
   - Assets /assets/: NO se interceptan; los sirve el navegador con su cache
     HTTP normal (así no hay JS viejo cacheado por el SW ni ERR_FAILED).
   - API y cross-origin: no se interceptan (fetch directo, sin cache). */

const CACHE_VERSION = 'mobos-shell-v3'

const SHELL_URLS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/mobos-icon-192.png',
  '/mobos-icon-512.png',
  '/favicon.svg',
  '/logo.svg',
  '/logo-dark.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => null))),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.mode !== 'navigate') return

  // Network-first: si hay red, servir fresca y refrescar el shell cacheado;
  // sin red, devolver el shell precacheado (SPA sigue funcionando offline).
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          caches
            .open(CACHE_VERSION)
            .then((cache) => cache.put('/index.html', response.clone()))
            .catch(() => {})
        }
        return response
      })
      .catch(() => caches.match('/index.html')),
  )
})
