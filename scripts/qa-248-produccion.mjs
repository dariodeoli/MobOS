// Verificación en producción del cambio #248 (sin sesión, la raíz y las rutas
// protegidas van a /login; /demo solo por entrada explícita) y del estado del
// bundle desplegado (referencia para los pendientes de #247).
//
// Uso: node scripts/qa-248-produccion.mjs
//      QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/248-redireccion-login/produccion node scripts/qa-248-produccion.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/248-redireccion-login/produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const erroresConsola = []
const respuestasMalas = []
let capturas = 0

async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturasPaso = []
  try {
    const detalle = await fn(capturasPaso)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: capturasPaso })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 300)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas: capturasPaso })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 200)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${String(error?.message || error).slice(0, 200)}`))
page.on('response', (res) => { if (res.status() >= 400) respuestasMalas.push(`${res.status()} ${res.url().replace(BASE, '').slice(0, 120)}`) })

let version = ''
await paso('estado: producción responde y se conoce la versión', async () => {
  const html = await (await fetch(`${BASE}/`)).text()
  const assets = [...html.matchAll(/\/assets\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1])
  const entry = assets.find((n) => n.startsWith('index-')) || ''
  let bytes = 0
  if (entry) bytes = (await (await fetch(`${BASE}/assets/${entry}`)).arrayBuffer()).byteLength
  return `entry ${entry} (${Math.round(bytes / 1024)} KB)`
})

await paso('sin sesión, la raíz va a /login (no a /demo)', async (capturasPaso) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/login(\?|$)/, { timeout: 20000 })
  const url = new URL(page.url())
  if (url.pathname !== '/login') throw new Error(`quedó en ${url.pathname}`)
  await page.getByRole('heading', { name: 'Entrá a tu tienda' }).waitFor({ timeout: 15000 })
  const pie = (await page.getByText(/v\d+\.\d+\.\d+/).first().textContent().catch(() => '')) || ''
  version = (pie.match(/v\d+\.\d+\.\d+/) || [])[0] || version
  capturasPaso.push(await shot(page, 'raiz-login'))
  return `URL ${url.pathname} · ${version || 'versión no visible'}`
})

await paso('ruta protegida pide login y guarda la vuelta', async (capturasPaso) => {
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/login\?/, { timeout: 20000 })
  const url = new URL(page.url())
  if (!url.searchParams.get('volver')?.includes('/inventario')) throw new Error(`volver=${url.searchParams.get('volver')}`)
  capturasPaso.push(await shot(page, 'protegida-login-volver'))
  return `volver=${url.searchParams.get('volver')}`
})

await paso('/demo sigue disponible solo por entrada explícita', async (capturasPaso) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Entrar como Dueño/ }).waitFor({ timeout: 20000 })
  capturasPaso.push(await shot(page, 'demo-explicita'))
  return 'entrada con perfiles visible'
})

await paso('enlace público sin sesión (informe /u/<serial>) no pide login', async (capturasPaso) => {
  await page.goto(`${BASE}/u/AUR0001000000000`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const url = new URL(page.url())
  if (url.pathname.startsWith('/login')) throw new Error(`redirigió a ${url.pathname}`)
  capturasPaso.push(await shot(page, 'informe-publico'))
  return `URL ${url.pathname}`
})

const resumen = {
  verificado: new Date().toISOString(),
  base: BASE,
  version,
  erroresConsola,
  respuestasMalas,
  resultados,
  resumen: {
    pasos: resultados.length,
    ok: resultados.filter((r) => r.estado === 'ok').length,
    fallos: resultados.filter((r) => r.estado === 'fallo').length,
  },
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(resumen, null, 2)}\n`)
console.log(`\n${resumen.resumen.ok}/${resumen.resumen.pasos} pasos OK · errores de consola: ${erroresConsola.length}`)

await browser.close()
if (resumen.resumen.fallos) process.exitCode = 1
