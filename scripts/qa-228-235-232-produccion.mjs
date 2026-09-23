// Verificación post-deploy del dominio PLT (#228 menú, #235 página demo,
// #232 higiene de logs) + panel de notificaciones de #148 §14 y taller/rack +
// infraestructura F3 de #240/#241 (stepper, impresión en serie y rutas v2
// apagadas), con capturas.
//
// Uso: node scripts/qa-228-235-232-produccion.mjs
//      QA_BASE_URL=<demo> QA_OUT=docs/qa/228-235-produccion node scripts/qa-228-235-232-produccion.mjs
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API_HOST = process.env.QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/228-235-produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const llamadasApi = []
const erroresConsola = []
const pendientesSinSesionReal = [
  'Zona de peligro (Eliminar cuenta) en Configuración → Seguridad: en la demo se muestra como no disponible; cobertura local en e2e/admin.spec.js (#228) con reauth + palabra ELIMINAR.',
  'Notificaciones con datos reales (pedidos, menciones, aprobaciones): la demo no comparte presencia/notificaciones; cobertura local en e2e/notificaciones.spec.js.',
  'Impresión real (etiquetas y hoja de estación A4): la demo la bloquea con aviso; cobertura local en e2e/inventario-unidades.spec.js y src/lib/printing/hojaEstacion.test.js.',
  'Restringir visibilidad de logs y rotar secretos en Coolify: pasos para Dario en docs/SEGURIDAD-LOGS.md y docs/ROTACION-TOKENS.md.',
]
let capturas = 0
let version = null

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
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas: capturasPaso, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 250)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${String(error?.message || error).slice(0, 250)}`))
page.on('request', (req) => {
  const url = req.url()
  if (url.includes(API_HOST) && url.includes('/api/')) llamadasApi.push(url.slice(0, 200))
})

// #235: la entrada /demo queda directa (PIN siempre visible, sin guía duplicada).
await paso('#235: entrada /demo sin guía duplicada y con PIN a la vista', async (c) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1300)
  await page.getByRole('heading', { name: /Entrá al sistema/ }).waitFor({ state: 'visible', timeout: 20000 })
  if (await page.getByText('Cómo funciona la demo').count()) throw new Error('la entrada sigue duplicando la guía')
  await page.getByText('Ventas y clientes.').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Operación completa.').waitFor({ state: 'visible', timeout: 10000 })
  const pin = page.locator('#demo-pin')
  await pin.waitFor({ state: 'visible', timeout: 10000 })
  c.push(await shot(page, 'demo-entrada'))
  return 'entrada directa: PIN a la vista, sin guía duplicada y descripciones cortas'
})

// Entrada a la demo (paso propio: si la entrada falla, no arrastra lo de abajo).
await paso('demo: entrar como Dueño con el PIN 3001', async (c) => {
  const pin = page.locator('#demo-pin')
  if (await pin.count()) await pin.pressSequentially('3001')
  else await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((destino) => !destino.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.getByText(/Modo demo: datos ficticios/).first().waitFor({ state: 'visible', timeout: 20000 })
  const cerrar = page.getByRole('button', { name: 'Cerrar' }).last()
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await cerrar.click()
  const texto = await page.locator('body').innerText()
  version = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0]
  c.push(await shot(page, 'demo-dentro'))
  return `PIN 3001 abrió la demo${version ? ` (${version})` : ''}`
})

// #228: menú de tres puntos corto, sin destructivos ni duplicados.
await paso('#228: menú de tres puntos corto y sin duplicados', async (c) => {
  await page.getByTestId('menu-acciones').click()
  const menu = page.getByTestId('menu-acciones-lista')
  for (const item of ['Configuración', 'Caja', 'Análisis', 'Clientes', 'Bloquear pantalla']) {
    await menu.getByRole('menuitem', { name: item, exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  }
  for (const fuera of ['Eliminar cuenta', 'Cerrar sesión', 'Preferencias', 'Cambiar sucursal']) {
    if (await menu.getByRole('menuitem', { name: fuera, exact: true }).count()) throw new Error(`el menú todavía muestra «${fuera}»`)
  }
  c.push(await shot(page, 'menu'))
  await page.keyboard.press('Escape')
  return '5 accesos de uso; sin destrucción, settings ni duplicados'
})

// #228: Preferencias vive en Configuración → Sistema (y no duplica el tema).
await paso('#228: Preferencias en Configuración → Sistema', async (c) => {
  await page.getByRole('button', { name: 'Configuración', exact: true }).click()
  await page.locator('main').getByRole('button', { name: 'Sistema', exact: true }).click()
  await page.locator('main').getByRole('tab', { name: 'Preferencias', exact: true }).click()
  await page.locator('#pref-bloqueo').waitFor({ state: 'visible', timeout: 20000 })
  // El tema vive en la barra superior: acá no debe haber controles Claro/Oscuro.
  if (await page.locator('main').getByRole('button', { name: /^(Claro|Oscuro)$/ }).count()) {
    throw new Error('la sección de Preferencias todavía repite el tema (Claro/Oscuro)')
  }
  c.push(await shot(page, 'preferencias'))
  return 'bloqueo por inactividad y notificaciones; sin tema duplicado'
})

// #148 §14: panel de notificaciones (en demo, estado honesto sin datos reales).
await paso('#148 §14: el aviso abre el panel de notificaciones', async (c) => {
  await page.getByTestId('notificaciones-aviso').click()
  const panel = page.getByRole('dialog')
  await panel.waitFor({ state: 'visible', timeout: 20000 })
  const texto = (await panel.innerText()).replace(/\s+/g, ' ')
  if (!/Notificaciones/i.test(texto)) throw new Error('el panel no se identifica como Notificaciones')
  c.push(await shot(page, 'notificaciones'))
  await page.keyboard.press('Escape')
  return `panel visible (${texto.slice(0, 80)}…)`
})

// #240 §4: modo taller/rack en la demo (carriles, estaciones, filtros, serie
// y stepper del flujo por unidad).
await paso('#240 §4: modo taller/rack con estaciones y filtros', async (c) => {
  await page.goto(`${BASE}/inventario/taller`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('rack-taller').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('rack-columna-por-verificar').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByLabel('Buscar en el taller').waitFor({ state: 'visible', timeout: 20000 })
  // Stepper del flujo: una unidad recién recibida marca el paso 1 de 3.
  const primerPaso = page.getByTestId('rack-columna-por-verificar').getByTestId('rack-equipo').first().getByTestId('rack-pasos')
  await primerPaso.waitFor({ state: 'visible', timeout: 10000 })
  if ((await primerPaso.getAttribute('data-paso')) !== '1') throw new Error('el stepper no marca el paso 1 en «por verificar»')
  const etiquetaPaso = await primerPaso.getAttribute('aria-label')
  if (!/Paso 1 de 3/.test(etiquetaPaso || '')) throw new Error(`stepper sin etiqueta clara: ${etiquetaPaso}`)
  // Estaciones: una sola a la vez.
  await page.getByTestId('rack-estacion-por-verificar').click()
  if (await page.getByTestId('rack-columna-listo').count()) throw new Error('la estación no filtró los carriles')
  await page.getByTestId('rack-estacion-todas').click()
  // Filtro por el serial de la primera unidad.
  const serial = await page.getByTestId('rack-equipo').first().getAttribute('data-serial')
  await page.getByLabel('Buscar en el taller').fill(serial)
  await page.waitForTimeout(400)
  if ((await page.getByTestId('rack-equipo').count()) !== 1) throw new Error(`la búsqueda del rack no filtró a ${serial}`)
  await page.getByLabel('Buscar en el taller').fill('')
  c.push(await shot(page, 'rack-taller'))
  return `carriles + estaciones + filtros + stepper + acciones en serie (${serial})`
})

// #240 §4: impresión en serie (alcances por estación/filtro) y aviso honesto
// de la demo al querer imprimir la hoja de estación.
await paso('#240 §4: impresión en serie con alcance y aviso de demo', async (c) => {
  await page.getByTestId('rack-estacion-por-verificar').click()
  await page.getByTestId('rack-imprimir-serie').click()
  const modal = page.getByRole('dialog', { name: 'Imprimir en serie' })
  await modal.waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('rack-alcance-estacion').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('rack-alcance-filtrados').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('rack-alcance-filtrados').click()
  if ((await page.getByTestId('rack-alcance-filtrados').getAttribute('aria-checked')) !== 'true') {
    throw new Error('el alcance elegido no quedó marcado')
  }
  const resumen = (await page.getByTestId('rack-impresion-resumen').innerText()).replace(/\s+/g, ' ').trim()
  if (!/\d+ etiqueta/.test(resumen)) throw new Error(`el resumen no muestra el alcance elegido: ${resumen}`)
  c.push(await shot(page, 'rack-impresion-serie'))
  await page.getByTestId('rack-hoja-estacion').click()
  await page.getByText('La impresión no está disponible en el demo.').waitFor({ state: 'visible', timeout: 10000 })
  c.push(await shot(page, 'rack-impresion-demo'))
  await page.getByTestId('rack-estacion-todas').click()
  return `alcances por estación/filtro + hoja de estación; aviso de demo (${resumen.slice(0, 60)}…)`
})

// #241: infraestructura F3 apagada en producción (rutas v2 sin flag).
await paso('#241: F3 apagada — /ops y /ops-preview no responden sin flag', async (c) => {
  await page.goto(`${BASE}/ops`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (await page.getByTestId('ops-preview').count()) throw new Error('la ruta /ops sirvió la vista previa sin flag')
  if (await page.getByTestId('ops-tablero').count()) throw new Error('la ruta /ops sirvió el tablero real sin VITE_OPS_V2')
  const rutaOps = new URL(page.url()).pathname
  if (rutaOps === '/ops') throw new Error('/ops quedó servida (no redirigió a la app)')
  c.push(await shot(page, 'ops-apagada'))
  await page.goto(`${BASE}/ops-preview`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (await page.getByTestId('ops-preview').count()) throw new Error('la vista previa se sirvió en producción sin flag')
  if (await page.getByTestId('ops-tablero').count()) throw new Error('el tablero real se sirvió en producción sin flag')
  const rutaPreview = new URL(page.url()).pathname
  if (rutaPreview === '/ops-preview') throw new Error('/ops-preview quedó servida (no redirigió a la app)')
  return `sin VITE_OPS_V2 ni VITE_OPS_PREVIEW: /ops→${rutaOps} y /ops-preview→${rutaPreview}`
})

// #232: auditoría de higiene de logs del repo.
await paso('#232: auditoría de logs sin volcados de env/secrets', async () => {
  let salida = ''
  try {
    salida = execFileSync('node', ['scripts/audit-logs.mjs'], { cwd: RAIZ, encoding: 'utf8' })
  } catch (error) {
    salida = String(error?.stdout || error?.message || error)
    throw new Error(`la auditoría encontró hallazgos: ${salida.slice(0, 200)}`)
  }
  const limpio = /Higiene de logs OK/.test(salida)
  if (!limpio) throw new Error(`salida inesperada: ${salida.slice(0, 200)}`)
  return salida.trim()
})

await paso('demo: 0 llamadas al API real', async () => {
  if (llamadasApi.length) throw new Error(`el demo llamó al API: ${llamadasApi.join(', ')}`)
  return 'ninguna request a /api/ en todo el recorrido'
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
  pendientesSinSesionReal,
  resumen: { pasos: resultados.length, ok: resultados.length - fallos.length, fallos: fallos.length },
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(salida, null, 2)}\n`)
console.log(`\n${salida.resumen.ok}/${salida.resumen.pasos} pasos OK · ${fallos.length} fallos · salida en ${SALIDA}`)
if (fallos.length) process.exitCode = 1
