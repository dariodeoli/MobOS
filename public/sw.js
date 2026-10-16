/* MobOS service worker — shell offline y notificaciones.
   Estrategia:
   - Shell precacheado en install (navegación y marca).
   - Navegaciones: network-first con fallback al shell cacheado.
   - API: nunca se intercepta ni se guarda. Una caché por URL no identifica
     la empresa, sesión ni permisos. El POS usa sus snapshots por separado.
   - Assets /assets/: NO se interceptan; los sirve el navegador con su cache
     HTTP normal (así no hay JS viejo cacheado por el SW ni ERR_FAILED). */

const CACHE_VERSION = 'mobos-shell-v5'

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
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Actualización controlada (#214): la app pide activar el SW nuevo cuando la
// persona acepta recargar (skipWaiting). El install ya lo hace solo, así que
// esto es la vía explícita para el aviso «Hay una versión nueva».
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  // #501: ni fallback de datos privados ni navegación API dentro del shell.
  // La activación también elimina mobos-api-v1 y sus respuestas heredadas.
  if (new URL(request.url).pathname.startsWith('/api/')) return

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


})

// A1 (#279) · Web Push: aviso genérico (nunca datos sensibles: el detalle vive
// en la bandeja interna del panel). `tag` evita duplicados del mismo evento y
// `notificationclick` enfoca una pestaña abierta o abre la ruta indicada.
self.addEventListener('push', (event) => {
  let datos = {}
  try { datos = event.data ? event.data.json() : {} } catch { datos = {} }
  const titulo = String(datos?.titulo || 'Tenés una novedad en MobOS').slice(0, 120)
  const cuerpo = String(datos?.cuerpo || 'Abrí MobOS para verla.').slice(0, 180)
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      tag: String(datos?.tag || 'mobos').slice(0, 64),
      renotify: false,
      icon: '/mobos-icon-192.png',
      badge: '/mobos-icon-192.png',
      data: { url: String(datos?.url || '/') },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(String(event.notification.data?.url || '/'), self.location.origin).href
  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const cliente of clientes) {
        if (cliente.url.startsWith(self.location.origin) && 'focus' in cliente) {
          await cliente.navigate(destino).catch(() => {})
          return cliente.focus()
        }
      }
      return self.clients.openWindow(destino)
    })(),
  )
})
