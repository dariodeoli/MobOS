/* MobOS service worker — PWA shell offline.
   Estrategia:
   - Shell precacheado en install (navegación y marca).
   - Navegaciones: network-first con fallback al shell cacheado.
   - Assets /assets/ same-origin: stale-while-revalidate con límite de tamaño.
   - API y cross-origin: no se interceptan (fetch directo, sin cache). */

const CACHE_VERSION = 'mobos-shell-v2'

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

// Límite de tamaño para assets cacheados en background (5 MB).
const ASSET_MAX_SIZE = 5 * 1024 * 1024

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

function isNavigation(request) {
  return request.mode === 'navigate'
}

function isAsset(request) {
  const url = new URL(request.url)
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (isNavigation(request)) {
    // Network-first: si hay red, servir fresca y refrescar el shell cacheado;
    // sin red, devolver el shell precacheado (SPA sigue funcionando offline).
    // Si el HTML cambió (deploy nuevo), se limpian los assets cacheados para
    // que la próxima carga use el build nuevo completo.
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const copy = response.clone()
            const freshText = await copy.text().catch(() => '')
            const cachedText = await caches
              .match('/index.html')
              .then((cached) => (cached ? cached.text() : ''))
              .catch(() => '')
            if (cachedText && freshText !== cachedText) {
              await caches.delete(CACHE_VERSION).catch(() => {})
            }
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put('/index.html', response.clone()))
              .catch(() => {})
          }
          return response
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  if (isAsset(request)) {
    // Stale-while-revalidate: cache-first y actualización en background,
    // solo para respuestas 200 que no superen el límite de tamaño.
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const size = Number(response.headers.get('content-length')) || 0
              if (!size || size <= ASSET_MAX_SIZE) {
                const copy = response.clone()
                caches
                  .open(CACHE_VERSION)
                  .then((cache) => cache.put(request, copy))
                  .catch(() => {})
              }
            }
            return response
          })
          .catch(() => cached)
        return cached || network
      }),
    )
    return
  }

  // API y cross-origin: no interceptar, el navegador hace el fetch directo sin cache.
})
