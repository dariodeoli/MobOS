import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const root = new URL('../../', import.meta.url)
const sw = readFileSync(new URL('public/sw.js', root), 'utf8')
const endpoints = ['/api/products', '/api/customers', '/api/combos', '/api/payment-accounts']
const shell = '<!doctype html><title>Shell QA501</title><main>SHELL_OFFLINE_QA501</main>'
let app, api, appOrigin, apiOrigin, state
const userOf = req => /qa-user=([^;]+)/.exec(req.headers.cookie || '')?.[1] || 'none'
const privateBody = user => ({ user, tenant: `EMPRESA_${user}`, role: user === 'A' ? 'OWNER' : 'SELLER', privateCanary: `SOLO_${user}`, costPyg: 987654, customerPhone: '595981000001' })

function apiResponse(req, res) {
  res.setHeader('Access-Control-Allow-Origin', appOrigin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.url.startsWith('/login/')) {
    res.setHeader('Set-Cookie', `qa-user=${req.url.split('/').at(-1)}; HttpOnly; SameSite=Lax; Path=/`)
    res.end('ok'); return
  }
  if (req.url === '/api/auth/logout') {
    res.setHeader('Set-Cookie', 'qa-user=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/')
    res.end('ok'); return
  }
  const user = userOf(req)
  state.requests.push({ user, path: req.url, origin: req.headers.origin })
  if (state.failure) { req.socket.destroy(); return }
  res.setHeader('Content-Type', 'application/json')
  if (state.denial) { res.statusCode = state.denial; res.end(JSON.stringify({ error: `denied-${state.denial}` })); return }
  const send = () => res.end(JSON.stringify(privateBody(user)))
  if (req.url.includes('late=1')) state.release = send
  else send()
}
function appResponse(req, res) {
  if (req.url.startsWith('/api/') || req.url.startsWith('/login/')) return apiResponse(req, res)
  res.setHeader('Cache-Control', 'no-store')
  if (req.url === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript')
    res.end(state.legacy ? "self.addEventListener('install', e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate', e=>e.waitUntil(self.clients.claim()));" : sw)
  } else if (['/src/lib/offline/snapshot.js', '/src/lib/offline/idb', '/src/lib/offline/idb.js'].includes(req.url)) {
    res.setHeader('Content-Type', 'application/javascript')
    res.end(readFileSync(new URL(req.url.slice(1) + (req.url.endsWith('/idb') ? '.js' : ''), root)))
  } else if (req.url === '/export.json') {
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(privateBody('A')))
  } else { res.setHeader('Content-Type', 'text/html'); res.end(shell) }
}
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}
async function controlled(page) {
  await page.goto(appOrigin)
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
  })
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(`${appOrigin}/sw.js`)
  const served = await page.evaluate(async () => await (await fetch('/sw.js')).text())
  expect(createHash('sha256').update(served).digest('hex')).toBe(createHash('sha256').update(sw).digest('hex'))
}
async function request(page, path, origin = apiOrigin) {
  return page.evaluate(async url => {
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
      return { status: response.status, body: await response.text(), cacheControl: response.headers.get('cache-control') }
    } catch { return { failed: true } }
  }, `${origin}${path}`)
}
async function cacheEntries(page) {
  return page.evaluate(async () => {
    const entries = []
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) entries.push({ name, url: request.url })
    return entries
  })
}
async function login(page, user) { expect((await request(page, `/login/${user}`)).status).toBe(200) }
async function changeSession(page) {
  expect((await request(page, '/api/auth/logout')).status).toBe(200)
  expect((await page.context().cookies(apiOrigin)).some(cookie => cookie.name === 'qa-user')).toBe(false)
  await login(page, 'B')
  expect((await page.context().cookies(apiOrigin)).find(cookie => cookie.name === 'qa-user')?.value).toBe('B')
}

test.beforeAll(async () => {
  app = createServer(appResponse); api = createServer(apiResponse)
  appOrigin = await listen(app); apiOrigin = await listen(api)
})
test.beforeEach(() => { state = { legacy: false, failure: false, denial: 0, requests: [], release: null } })
test.afterAll(async () => {
  for (const server of [app, api]) {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})

test('501 cookies A→logout→B: cuatro API network-only, 401/403 intactos y fallo de red nunca devuelve A', async ({ page }) => {
  await controlled(page)
  await login(page, 'A')
  for (const endpoint of endpoints) {
    const response = await request(page, endpoint)
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual(privateBody('A'))
    expect(response.cacheControl).toBe('private, no-store')
  }
  expect((await cacheEntries(page)).some(entry => new URL(entry.url).pathname.startsWith('/api/'))).toBe(false)
  await changeSession(page)
  for (const denial of [401, 403]) {
    state.denial = denial
    for (const endpoint of endpoints) {
      const response = await request(page, endpoint)
      expect(response.status).toBe(denial)
      expect(response.body).not.toContain('SOLO_A')
    }
  }
  state.denial = 0
  state.failure = true
  for (const endpoint of endpoints) expect(await request(page, endpoint)).toEqual({ failed: true })
  expect(state.requests.filter(item => item.user === 'B' && endpoints.includes(item.path)).length).toBeGreaterThanOrEqual(12)
  expect((await cacheEntries(page)).some(entry => entry.name.includes('api') || new URL(entry.url).pathname.startsWith('/api/'))).toBe(false)
})

test('501 actualizar SW purga caché API legado y shell antiguo antes de reclamar cliente', async ({ page }) => {
  state.legacy = true
  await page.goto(appOrigin)
  await page.evaluate(async apiOrigin => {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
    const legacy = await caches.open('mobos-api-v1')
    for (const path of ['/api/products', '/api/customers', '/api/combos', '/api/payment-accounts']) await legacy.put(`${apiOrigin}${path}`, new Response('SOLO_A'))
    await (await caches.open('mobos-shell-v4')).put('/index.html', new Response('OLD_SHELL_A'))
  }, apiOrigin)
  expect((await cacheEntries(page)).filter(entry => entry.name === 'mobos-api-v1')).toHaveLength(4)
  state.legacy = false
  await page.evaluate(async () => {
    const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
    const registration = await navigator.serviceWorker.getRegistration()
    await registration.update()
    await changed
  })
  await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['mobos-shell-v5'])
  await login(page, 'B')
  state.failure = true
  for (const path of endpoints) expect(await request(page, path)).toEqual({ failed: true })
})

test('501 respuesta A en vuelo después de logout llega a su llamador pero nunca repuebla caché compartida', async ({ page }) => {
  await controlled(page)
  await login(page, 'A')
  await page.evaluate(origin => { window.lateResult = fetch(`${origin}/api/products?late=1`, { credentials: 'include' }).then(response => response.text()) }, apiOrigin)
  await expect.poll(() => typeof state.release).toBe('function')
  await changeSession(page)
  state.release()
  // El SW no cancela fetches del consumidor: su guard de contexto es otra frontera.
  expect(await page.evaluate(() => window.lateResult)).toContain('SOLO_A')
  state.failure = true
  expect(await request(page, '/api/products?late=1')).toEqual({ failed: true })
  expect((await cacheEntries(page)).some(entry => entry.name.includes('api') || entry.url.includes('/api/'))).toBe(false)
})

test('501 navegación API/JSON no contamina shell y shell HTML sigue disponible sin conexión', async ({ page, context }) => {
  await controlled(page)
  await login(page, 'A')
  for (const path of ['/api/products', '/export.json']) {
    const response = await page.goto(`${appOrigin}${path}`)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(await response.text()).toContain('SOLO_A')
    expect(await page.evaluate(async () => await (await caches.match('/index.html')).text())).toBe(shell)
  }
  await page.goto(appOrigin)
  await context.setOffline(true)
  await page.goto(`${appOrigin}/pos/offline`)
  await expect(page.getByText('SHELL_OFFLINE_QA501', { exact: true })).toBeVisible()
  expect(await page.title()).toBe('Shell QA501')
  // Última navegación: un fallo real puede comprometer chrome-error después
  // de que goto rechace; no competimos con esa transición del navegador.
  const failedNavigation = await page.goto(`${appOrigin}/api/customers`).then(() => false, () => true)
  expect(failedNavigation, 'API offline falla; nunca devuelve shell HTML ni respuesta privada cacheada').toBe(true)
})

test('501 snapshot POS conserva contexto privado en IndexedDB y retira A al activar B; no reemplaza autorización', async ({ page }) => {
  await controlled(page)
  await login(page, 'A')
  await page.evaluate(async () => {
    window.snapshots = await import('/src/lib/offline/snapshot.js')
    window.tokenA = window.snapshots.activarContextoSnapshots({ empresaId: 'EMPRESA_A', userId: 'USER_A', sucursalId: 'SUC_A', rol: 'OWNER', permisos: ['ventas', 'costos'] })
    if (!await window.snapshots.guardarSnapshotCatalogo(window.tokenA, { products: [{ id: 'SOLO_A' }], orders: [], users: [], finance: [] })) throw new Error('snapshot A no guardado')
  })
  expect(await page.evaluate(async () => (await window.snapshots.leerSnapshotCatalogo(window.tokenA)).products)).toEqual([{ id: 'SOLO_A' }])
  await changeSession(page)
  await page.evaluate(() => {
    window.tokenB = window.snapshots.activarContextoSnapshots({ empresaId: 'EMPRESA_B', userId: 'USER_B', sucursalId: 'SUC_B', rol: 'SELLER', permisos: ['ventas'] })
  })
  state.failure = true
  expect(await request(page, '/api/products')).toEqual({ failed: true })
  const snapshots = await page.evaluate(async () => ({ a: await window.snapshots.leerSnapshotCatalogo(window.tokenA), b: await window.snapshots.leerSnapshotCatalogo(window.tokenB) }))
  expect(snapshots.a).toBeNull()
  expect(snapshots.b).toBeNull()
  expect(await page.evaluate(async () => {
    await window.snapshots.guardarSnapshotCatalogo(window.tokenB, { products: [{ id: 'SOLO_B' }], orders: [] })
    return (await window.snapshots.leerSnapshotCatalogo(window.tokenB)).products
  })).toEqual([{ id: 'SOLO_B' }])
  expect(await page.evaluate(() => window.snapshots.leerSnapshotCatalogo(window.tokenA))).toBeNull()
})

test('501 handlers push/click y SKIP_WAITING siguen ejecutándose en SW real sin servicios externos', async ({ page, context }) => {
  await controlled(page)
  const worker = context.serviceWorkers().find(worker => worker.url() === `${appOrigin}/sw.js`)
  const result = await worker.evaluate(async () => {
    const notifications = [], actions = [], pending = []
    // Sumideros locales de efectos del navegador: se ejecutan los handlers
    // registrados por public/sw.js exacto; no se contacta proveedor push.
    self.registration.showNotification = async (title, options) => { notifications.push({ title, options }) }
    self.skipWaiting = async () => { actions.push('skipWaiting') }
    self.clients.matchAll = async () => [{ url: `${self.location.origin}/pos`, navigate: async url => { actions.push(url) }, focus: async () => { actions.push('focus') } }]
    const dispatch = (type, properties) => {
      const event = new Event(type)
      for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value })
      Object.defineProperty(event, 'waitUntil', { value: promise => pending.push(promise) })
      self.dispatchEvent(event)
    }
    dispatch('push', { data: { json: () => ({ titulo: 'Novedad QA', cuerpo: 'Abrí el panel QA.', tag: 'qa501', url: '/notificaciones' }) } })
    dispatch('notificationclick', { notification: { close: () => actions.push('close'), data: { url: '/notificaciones' } } })
    dispatch('message', { data: { type: 'SKIP_WAITING' } })
    await Promise.all(pending)
    return { notifications, actions }
  })
  expect(result.notifications).toHaveLength(1)
  expect(result.notifications[0]).toMatchObject({ title: 'Novedad QA', options: { body: 'Abrí el panel QA.', tag: 'qa501', icon: '/mobos-icon-192.png', badge: '/mobos-icon-192.png', renotify: false, data: { url: '/notificaciones' } } })
  expect(result.actions).toEqual(expect.arrayContaining(['close', 'focus', 'skipWaiting', `${appOrigin}/notificaciones`]))
})
