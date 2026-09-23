// Verificación en producción del historial del serial (#240) — ronda del
// historial del serial (verificaciones, consultas IMEI, reparaciones y
// movimientos).
//
//   node scripts/qa-240-historial-serial-prod.mjs
//
// Lee la versión desplegada, revisa qué marcas del historial están en los
// assets y, en la demo, abre la cronología de una unidad, las consultas IMEI
// del serial y el informe público, con capturas. Si la ronda todavía no está
// desplegada, lo deja dicho en el reporte (base desplegada ✅ / extensión
// pendiente de integrar).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Serial ficticio del primer equipo de la demo (mismo generador que la app).
import { serialDemo } from '../src/lib/demo/iphones.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/240-historial-serial/prod')
mkdirSync(SALIDA, { recursive: true })

// Marcas del historial del serial: las base tienen que estar en producción;
// las de la extensión (consultas IMEI + reparaciones + certificaciones) se
// reportan como "pendiente de integrar" hasta que la ronda se despliegue.
const MARCAS = {
  'Cronología': { tipo: 'base', que: 'la ficha de la unidad' },
  'Consultas IMEI': { tipo: 'base', que: 'el modal de consultas del serial' },
  'Informe de dispositivo': { tipo: 'base', que: 'el informe público' },
  'Consulta IMEI': { tipo: 'extension', que: 'evento de consulta IMEI en la cronología' },
  'Reparación': { tipo: 'extension', que: 'evento de reparación en la cronología' },
  'Certificaciones PhoneCheck': { tipo: 'extension', que: 'el tablero de certificaciones' },
  'Repuestos no-OEM': { tipo: 'extension', que: 'los repuestos en el informe público' },
}

const resultados = []
const llamadasApi = []
const assets = new Set()
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('request', (peticion) => {
  const url = peticion.url()
  if (/\/assets\/.+\.js$/.test(url)) assets.add(url)
  if (url.includes('/src/')) return
  if (/\/api\//.test(url)) llamadasApi.push(`${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`)
})

const esperar = (ms) => page.waitForTimeout(ms)
let contador = 0
async function captura(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  try {
    const detalle = await fn(async (n) => { const archivo = await captura(n); capturas.push(archivo); return archivo })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

let versionProduccion = ''
let marcasPresentes = {}

await paso('demo: entrar y leer la versión desplegada', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = version ? version[1] : ''
  await shot('demo-panel')
  return versionProduccion ? `v${versionProduccion}` : '(sin versión visible)'
})

await paso('producción: marcas del historial del serial en los assets', async () => {
  for (const ruta of ['/inventario/unidades', '/inventario/alertas', '/pos']) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await esperar(1200)
  }
  const html = await (await fetch(`${BASE}/login`, { redirect: 'follow' })).text()
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  const bundles = await Promise.all([...assets].map(async (fuente) => (await fetch(fuente)).text().catch(() => '')))
  const codigo = bundles.join('\n')
  marcasPresentes = Object.fromEntries(Object.entries(MARCAS).map(([marca, meta]) => [marca, { ...meta, presente: codigo.includes(marca) }]))
  const baseFaltante = Object.entries(marcasPresentes).filter(([, meta]) => meta.tipo === 'base' && !meta.presente).map(([marca]) => marca)
  if (baseFaltante.length) throw new Error(`faltan marcas base en los assets: ${baseFaltante.join(' · ')}`)
  const extension = Object.entries(marcasPresentes).filter(([, meta]) => meta.tipo === 'extension' && meta.presente).map(([marca]) => marca)
  return `${assets.size} assets · base presente · extensión ${extension.length ? `presente: ${extension.join(', ')}` : 'pendiente de integrar (ronda sin desplegar)'}`
})

await paso('demo: cronología del serial en la ficha de la unidad', async (shot) => {
  const serial = serialDemo(20) // unidad vendida sin entregar: sigue en inventario y su cronología tiene la venta
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  await esperar(1500)
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 10000 })
  const cronologia = ficha.getByTestId('unidad-cronologia')
  await cronologia.scrollIntoViewIfNeeded()
  await expectVisible(cronologia, 15000)
  await shot('cronologia-serial')
  // Cada movimiento es un <article> con fecha, etiqueta (tipo) y detalle.
  const filas = cronologia.locator('article')
  const total = await filas.count()
  const eventos = []
  for (let i = 0; i < Math.min(total, 5); i += 1) eventos.push((await filas.nth(i).innerText()).replace(/\s*\n\s*/g, ' · ').trim())
  await shot('cronologia-eventos')
  return `serial ${serial} · ${total} evento(s)${eventos.length ? `: ${eventos.join(' | ')}` : ' (la unidad no tiene movimientos)'}`
})

await paso('demo: consultas IMEI del serial (historial de consultas)', async (shot) => {
  const abrir = page.getByTestId('imei-consultas-abrir')
  if (!(await abrir.count())) throw new Error('la ficha no ofrece «Consultas IMEI»')
  await abrir.first().click()
  const modal = page.getByRole('dialog', { name: /Consultas IMEI/i })
  await modal.waitFor({ state: 'visible', timeout: 10000 })
  await esperar(1200)
  await shot('consultas-imei')
  const texto = await modal.innerText()
  return texto.includes('conciliar') ? 'muestra consultas y su estado de conciliación' : 'modal disponible (sin consultas del serial en la demo)'
})

await paso('demo: informe público por serial (/u/<serial>)', async (shot) => {
  const serial = serialDemo(20) // unidad vendida sin entregar: sigue en inventario y su cronología tiene la venta
  const respuesta = await page.goto(`${BASE}/u/${serial}`, { waitUntil: 'domcontentloaded' })
  await esperar(2200)
  await shot('informe-publico')
  const texto = await page.locator('body').innerText()
  if (/No encontramos este equipo/i.test(texto)) throw new Error('el informe público no encontró el serial de la demo')
  if (!/Informe de dispositivo/i.test(texto)) throw new Error('el informe público no mostró el encabezado esperado')
  const http = respuesta?.status() || 0
  return `HTTP ${http} · ${serial}`
})

await browser.close()

function expectVisible(locator, timeout) {
  return locator.waitFor({ state: 'visible', timeout })
}

const extension = Object.entries(marcasPresentes).filter(([, meta]) => meta.tipo === 'extension')
const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  extensionDesplegada: extension.some(([, meta]) => meta.presente),
  erroresConsola: erroresConsola.length,
}
writeFileSync(join(SALIDA, 'produccion.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  marcas: marcasPresentes,
  resultados,
  assets: [...assets],
  llamadasApi: [...new Set(llamadasApi)],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)

const lineas = [
  `# Historial del serial (#240) · verificación en producción`,
  '',
  `- Producción: ${BASE} · versión v${versionProduccion || '?'} · ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK`,
  `- Ronda del historial del serial (consultas IMEI + reparaciones + certificaciones): **${veredicto.extensionDesplegada ? 'desplegada' : 'todavía sin desplegar'}**`,
  veredicto.extensionDesplegada ? '' : '- Lo verificado acá es la **base desplegada** (cronología de la unidad, consultas IMEI del serial e informe público); la extensión queda lista para la verificación post-deploy con este mismo script.',
  '',
  '## Marcas en los assets desplegados',
  '',
  ...Object.entries(marcasPresentes).map(([marca, meta]) => `- ${meta.presente ? '✅' : '⏳'} \`${marca}\` (${meta.tipo}) — ${meta.que}`),
  '',
  '## Pasos',
  '',
  ...resultados.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Notas',
  '',
  '- El historial del serial de la cuenta real sale de `GET /api/inventory-units/:id/history`; en la demo se arma con los eventos de la unidad + consultas IMEI + servicio técnico del navegador.',
  '- La página pública (`/u/<serial>`) muestra el serial y el IMEI enmascarados y no incluye datos del cliente.',
  `- Errores de consola durante la corrida: ${erroresConsola.length}.`,
  '',
].filter(Boolean).join('\n') + '\n'
writeFileSync(join(SALIDA, 'REPORTE.md'), lineas)

console.log(`\nVeredicto: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · extensión ${veredicto.extensionDesplegada ? 'desplegada' : 'pendiente de integrar'} · ${erroresConsola.length} errores de consola`)
console.log(`Evidencia: ${SALIDA}`)
