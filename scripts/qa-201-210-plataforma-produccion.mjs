// Verificación post-deploy de #201 (demo solo sesión), #209 (último usado) y
// #210 (pantalla de bloqueo con foto y logos por tema) sobre el panel publicado.
//
// Uso:
//   node scripts/qa-201-210-plataforma-produccion.mjs
//   QA_BASE_URL=http://localhost:5241 node scripts/qa-201-210-plataforma-produccion.mjs
//   QA_OUT=docs/qa/201-210-produccion node scripts/qa-201-210-plataforma-produccion.mjs
//
// Salida: <QA_OUT>/*.jpg + resultados.json (versión, pasos, capturas, llamadas
// al API y lo que no es verificable sin sesión real). Sale 1 si un paso falla.
/* global indexedDB, caches, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API_HOST = process.env.QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/201-210-produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const llamadasApi = []
const erroresConsola = []
let capturas = 0
let version = null

// Lo que la demo pública no puede probar (necesita sesión real y más de una
// persona en línea). Se documenta con los pasos manuales.
const pendientes = [
  'Foto subida y logo de tienda reales: requieren sesión real. Pasos: entrar a /login con empresa + PIN, subir foto en Mi identidad y logo en Configuración → Negocio, bloquear pantalla (menú de tres puntos) y mirar foto + logo en claro/oscuro.',
  'PresencePill con la foto de todas las personas: requiere sesión real con 2+ personas en línea (la demo no comparte presencia, #192). Local: e2e/shell-roles.spec.js mockea la presencia y verifica foto subida, iniciales y nombre corto.',
]

async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturasPaso = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(capturasPaso)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: capturasPaso, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 500)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas: capturasPaso, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

// Nada nuevo en localStorage, sessionStorage, cookies, IndexedDB ni Cache
// Storage (incluida la cola offline): contrato del demo (#201/#204).
async function instantanea(page) {
  return page.evaluate(async () => {
    const idb = indexedDB.databases ? (await indexedDB.databases()).map((base) => base.name).sort() : []
    const clavesCache = typeof caches !== 'undefined' ? (await caches.keys()).sort() : []
    const cachesContenido = {}
    for (const clave of clavesCache) {
      const cache = await caches.open(clave)
      cachesContenido[clave] = (await cache.keys()).map((pedido) => new URL(pedido.url).pathname).sort()
    }
    return { local: Object.keys(localStorage).sort(), sesion: Object.keys(sessionStorage).sort(), cookie: document.cookie, idb, caches: cachesContenido }
  })
}

const nuevas = (previas, actuales) => actuales.filter((clave) => !previas.includes(clave))

function seguirRed(page) {
  page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
  page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${String(error?.message || error).slice(0, 300)}`))
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(API_HOST) && url.includes('/api/')) llamadasApi.push(url.slice(0, 200))
  })
}

async function entrarDemo(page, rol = 'Dueño') {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: new RegExp(`Entrar como ${rol}`) }).click()
  await page.waitForURL((destino) => !destino.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.getByText(/Modo demo: datos ficticios/).first().waitFor({ state: 'visible', timeout: 20000 })
  const cerrar = page.getByRole('button', { name: 'Cerrar' }).last()
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await cerrar.click()
}

async function bloquear(page) {
  await page.getByTestId('menu-acciones').click()
  await page.getByTestId('menu-acciones-lista').getByRole('menuitem', { name: 'Bloquear pantalla', exact: true }).click()
  const bloqueo = page.getByTestId('pantalla-bloqueada')
  await bloqueo.waitFor({ state: 'visible', timeout: 20000 })
  return bloqueo
}

async function abrirDocumentacion(page) {
  await page.getByRole('button', { name: 'Configuración', exact: true }).click()
  await page.locator('main').getByRole('button', { name: 'Sistema', exact: true }).click()
  await page.locator('main').getByRole('tab', { name: 'Documentación', exact: true }).click()
  await page.getByRole('heading', { name: 'Documentación', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
}

async function bundleTiene(agujas) {
  const html = await (await fetch(`${BASE}/login`)).text()
  const fuentes = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], BASE).href)
  for (const fuente of fuentes) {
    const bundle = await (await fetch(fuente)).text()
    if (agujas.every((aguja) => bundle.includes(aguja))) return { fuente, ok: true }
  }
  return { fuente: fuentes[0] || null, ok: false }
}

const browser = await chromium.launch()

// 1) Pantalla de bloqueo en la demo: foto/iniciales, logo MobOS y contrato demo
// en tema claro, con captura. La demo no tiene logo de tienda (no toca el API).
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  seguirRed(page)

  await paso('bloqueo (claro): MobOS logo, avatar del usuario y PIN intactos', async (c) => {
    await entrarDemo(page, 'Dueño')
    const texto = await page.locator('body').innerText()
    version = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0]
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    const bloqueo = await bloquear(page)
    const logo = bloqueo.locator('img[alt="MobOS"]')
    const src = await logo.getAttribute('src')
    if (!/\/logo\.svg$/.test(src || '')) throw new Error(`logo de MobOS inesperado: ${src}`)
    if (await bloqueo.locator('img[alt^="Foto de"]').count()) throw new Error('la demo no debe mostrar una foto real')
    await bloqueo.getByTitle('Dueño demo').waitFor({ state: 'visible', timeout: 20000 })
    if (await bloqueo.getByTestId('lock-logo-empresa').count()) throw new Error('la demo no debe pedir el logo de tienda (API)')
    if (!/Ingresá tu PIN de 4 dígitos/.test(await bloqueo.innerText())) throw new Error('no se ve la ayuda del PIN')
    c.push(await shot(page, 'bloqueo-claro'))
    await page.locator('#lock-pin').pressSequentially('3001')
    await bloqueo.waitFor({ state: 'hidden', timeout: 20000 })
    return `${version || 'versión sin detectar'} · logo claro, iniciales y PIN auto-validado`
  })

  await paso('último usado (#209): POS recordado en la sesión y descartado al recargar', async (c) => {
    await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
    await abrirDocumentacion(page)
    const todo = page.locator('main').getByRole('button', { name: 'Todo', exact: true })
    const pos = page.locator('main').getByRole('button', { name: 'POS', exact: true })
    if ((await todo.getAttribute('aria-pressed')) !== 'true') throw new Error('el default de Documentación no es «Todo»')
    await pos.click()
    if ((await pos.getAttribute('aria-pressed')) !== 'true') throw new Error('elegir POS no quedó seleccionado')
    await page.getByRole('button', { name: 'Resumen', exact: true }).click()
    await page.getByRole('heading', { name: 'Resumen general' }).waitFor({ state: 'visible', timeout: 20000 })
    await abrirDocumentacion(page)
    if ((await pos.getAttribute('aria-pressed')) !== 'true') throw new Error('POS no se recordó al volver (navegación SPA)')
    if (await page.evaluate(() => localStorage.getItem('mobos:config:documentacion-modulo')) !== null) throw new Error('el helper escribió en localStorage durante la demo')
    c.push(await shot(page, 'ultimo-usado-recordado'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Documentación', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
    if ((await page.locator('main').getByRole('button', { name: 'Todo', exact: true }).getAttribute('aria-pressed')) !== 'true') throw new Error('el último usado no se descartó al recargar')
    c.push(await shot(page, 'ultimo-usado-descartado'))
    return 'recordado en la sesión, descartado al recargar y sin escritura en localStorage'
  })

  const inicial = await instantanea(page)
  const marca = Date.now()
  await paso('#201: guardados de la demo no persisten', async (c) => {
    await page.goto(`${BASE}/configuracion/equipo`, { waitUntil: 'domcontentloaded' })
    await page.locator('#direct-name').fill(`QA 201 ${marca}`)
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await page.getByText('Integrante agregado correctamente.').waitFor({ state: 'visible', timeout: 20000 })
    await page.goto(`${BASE}/plantillas`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Nueva plantilla/ }).click()
    await page.locator('#plantilla-nombre').fill(`QA 201 ${marca}`)
    await page.getByLabel('Mensaje de la plantilla').fill('Plantilla ficticia de verificación.')
    await page.getByRole('button', { name: 'Crear plantilla' }).click()
    await page.getByText('Plantilla creada.').waitFor({ state: 'visible', timeout: 20000 })
    const tras = await instantanea(page)
    const problemas = []
    const localNuevas = nuevas(inicial.local, tras.local)
    const sesionNuevas = nuevas(inicial.sesion, tras.sesion).filter((clave) => !clave.startsWith('mobos:demo-session'))
    if (localNuevas.length) problemas.push(`localStorage: ${localNuevas.join(', ')}`)
    if (sesionNuevas.length) problemas.push(`sessionStorage: ${sesionNuevas.join(', ')}`)
    if (nuevas(inicial.idb, tras.idb).length) problemas.push(`IndexedDB: ${nuevas(inicial.idb, tras.idb).join(', ')}`)
    if (JSON.stringify(inicial.caches) !== JSON.stringify(tras.caches)) problemas.push('Cache Storage cambió')
    if (inicial.cookie !== tras.cookie) problemas.push('cookies cambiaron')
    if (problemas.length) throw new Error(problemas.join(' · '))
    c.push(await shot(page, 'almacenamiento-limpio'))
    return `sin claves nuevas (local ${tras.local.length}, sesión ${tras.sesion.length}, idb ${tras.idb.length})`
  })

  await paso('#201: la recarga descarta los guardados', async (c) => {
    await page.goto(`${BASE}/configuracion/equipo`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    if (await page.getByTestId('integrante-fila').filter({ hasText: `QA 201 ${marca}` }).count()) throw new Error('el integrante ficticio sobrevivió a la recarga')
    await page.goto(`${BASE}/plantillas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    if (await page.getByText(`QA 201 ${marca}`).count()) throw new Error('la plantilla ficticia sobrevivió a la recarga')
    c.push(await shot(page, 'recarga-reset'))
    return 'los guardados vuelven al seed tras recargar'
  })

  await paso('#201: cero llamadas al API real', async () => {
    if (llamadasApi.length) throw new Error(`la demo llamó al API: ${llamadasApi.join(', ')}`)
    return 'ninguna request a /api/ durante todo el recorrido'
  })

  await ctx.close()
}

// 2) Tema oscuro y móvil: la variante del logo de MobOS sigue al fondo (#210).
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  const page = await ctx.newPage()
  seguirRed(page)
  await paso('bloqueo (oscuro): el logo de MobOS cambia de variante', async (c) => {
    await entrarDemo(page, 'Vendedor')
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    const bloqueo = await bloquear(page)
    const src = await bloqueo.locator('img[alt="MobOS"]').getAttribute('src')
    if (!/\/logo-dark\.svg$/.test(src || '')) throw new Error(`logo de MobOS inesperado en oscuro: ${src}`)
    c.push(await shot(page, 'bloqueo-oscuro'))
    return 'logo claro sobre fondo oscuro'
  })
  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  seguirRed(page)
  await paso('bloqueo (móvil): entra completo en la pantalla', async (c) => {
    await entrarDemo(page, 'Dueño')
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    const bloqueo = await bloquear(page)
    const caja = await bloqueo.boundingBox()
    if (!caja || caja.x < 0 || caja.y < 0 || caja.x + caja.width > 391) throw new Error(`la tarjeta no entra en 390 px: ${JSON.stringify(caja)}`)
    await bloqueo.locator('img[alt="MobOS"]').waitFor({ state: 'visible' })
    c.push(await shot(page, 'bloqueo-movil'))
    return 'tarjeta completa a 390 px con logo y avatar'
  })
  await ctx.close()
}

// 3) El deploy contiene el código del lote (helpers #209 y bloqueo #210).
await paso('deploy: el bundle publicado incluye #209 y #210', async () => {
  // El bundle principal alcanza para probar que el lote viaja: la pantalla de
  // bloqueo, el namespace canónico y el evento del helper. Las claves de cada
  // pantalla viven en chunks lazy y se prueban con los pasos funcionales.
  const agujas = ['lock-logo-empresa', 'mobos:ultimo:', 'mobos:ultimo-usado', 'sucursal-activa']
  const { fuente, ok } = await bundleTiene(agujas)
  if (!ok) throw new Error(`el bundle ${fuente} no expone el lote (#209/#210): ¿deploy viejo?`)
  return `claves y testid presentes en ${fuente}`
})

await browser.close()

const fallos = resultados.filter((r) => r.estado === 'fallo')
const salida = {
  verificado: new Date().toISOString(),
  base: BASE,
  version,
  llamadasApi,
  erroresConsola,
  resultados,
  pendientesSinSesionReal: pendientes,
  resumen: { pasos: resultados.length, ok: resultados.length - fallos.length, fallos: fallos.length },
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(salida, null, 2)}\n`)
console.log(`\n${salida.resumen.ok}/${salida.resumen.pasos} pasos OK · ${fallos.length} fallos · salida en ${SALIDA}`)
if (fallos.length) process.exitCode = 1
