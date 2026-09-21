/* MobOS service worker — PWA shell offline + catálogo para el POS offline.
   Estrategia:
   - Shell precacheado en install (navegación y marca).
   - Navegaciones: network-first con fallback al shell cacheado.
   - API de catálogo (GET de productos/clientes/cuentas/combos): network-first;
     sin red se sirve la última respuesta buena para poder arrancar el POS y
     vender sin conexión. El resto de la API no se intercepta.
   - Assets /assets/: NO se interceptan; los sirve el navegador con su cache
     HTTP normal (así no hay JS viejo cacheado por el SW ni ERR_FAILED). */

const CACHE_VERSION = 'mobos-shell-v4'
const API_CACHE = 'mobos-api-v1'

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

// GET de la API que vale cachear para el arranque offline del POS. Los pedidos
// no se cachean acá: los hidrata la app desde su propia foto local.
const API_CACHEABLES = [
  /\/api\/products(\?|$)/,
  /\/api\/customers(\?|$)/,
  /\/api\/combos(\?|$)/,
  /\/api\/payment-accounts(\?|$)/,
]
const API_CACHE_MAX = 80

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
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION && key !== API_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

const esApiCacheable = (url) => API_CACHEABLES.some((patron) => patron.test(url.pathname + url.search))

async function guardarRespuestaApi(request, response) {
  try {
    const cache = await caches.open(API_CACHE)
    await cache.put(request, response)
    // La cache de catálogo no crece sin límite: se descartan las más viejas.
    const claves = await cache.keys()
    if (claves.length > API_CACHE_MAX) {
      await Promise.all(claves.slice(0, claves.length - API_CACHE_MAX).map((clave) => cache.delete(clave)))
    }
  } catch {
    /* cuota o modo privado: se sigue sin cache */
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
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
    return
  }

  const url = new URL(request.url)
  if (!esApiCacheable(url)) return
  // Catálogo/clientes: primero la red (dato fresco); si no hay, la última
  // respuesta buena guardada. Nunca se inventa una respuesta vacía.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) guardarRespuestaApi(request, response.clone())
        return response
      })
      .catch(async () => {
        const cache = await caches.open(API_CACHE)
        const guardada = await cache.match(request)
        if (guardada) return guardada
        throw new Error('sin conexión y sin copia local')
      }),
  )
})
