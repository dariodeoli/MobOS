// Verificación de #247 en producción (v1.0.153): mide el bundle desplegado y la
// carga de las pantallas de la demo (inventario, POS, pedidos, clientes y
// finanzas) y lo compara con la línea base v1.0.152 (entry de 1104 KB).
//
// Uso: node scripts/qa-247-produccion.mjs
//      QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/247-performance/produccion node scripts/qa-247-produccion.mjs
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/247-performance/produccion')
const BASELINE = join(RAIZ, 'docs/qa/248-redireccion-login/produccion/resultados.json')
mkdirSync(SALIDA, { recursive: true })

const PANTALLAS = [
  { id: 'inventario', ruta: '/inventario/unidades', listo: async (page) => { await page.getByRole('heading', { name: 'Unidades' }).waitFor({ timeout: 20000 }); await page.getByTestId('inventario-fila').first().waitFor({ timeout: 20000 }) } },
  { id: 'pos', ruta: '/pos', listo: async (page) => { await page.getByRole('heading', { name: 'Nueva venta' }).waitFor({ timeout: 20000 }) } },
  { id: 'pedidos', ruta: '/pedidos', listo: async (page) => { await page.getByTestId('pedidos-tabla').waitFor({ timeout: 20000 }); await page.getByTestId('pedido-fila').first().waitFor({ timeout: 20000 }) } },
  { id: 'clientes', ruta: '/clientes', listo: async (page) => { await page.getByTestId('cliente-fila').first().waitFor({ timeout: 20000 }) } },
  { id: 'finanzas', ruta: '/finanzas/caja', listo: async (page) => { await page.getByRole('heading', { name: 'Caja', exact: true }).waitFor({ timeout: 20000 }) } },
]

const resultados = []
let capturas = 0
async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 70 })
  return archivo
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const page = await ctx.newPage()
const llamadasApi = []
page.on('request', (req) => { if (req.url().includes('/api/')) llamadasApi.push(req.url()) })

// 1) Bundle desplegado (determinista).
const html = await (await fetch(`${BASE}/`)).text()
const assets = [...html.matchAll(/\/assets\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1])
const tamanios = {}
for (const activo of assets) tamanios[activo] = (await (await fetch(`${BASE}/assets/${activo}`)).arrayBuffer()).byteLength
const entry = assets.find((n) => n.startsWith('index-')) || ''
const entryKB = Math.round((tamanios[entry] || 0) / 1024)
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
const baselineEntry = baseline?.resultados?.find?.((r) => String(r.detalle || '').includes('entry'))?.detalle || ''
// La línea base registrada por qa-248 decía "entry index-… (1104 KB)".
const baselineKB = Number((baselineEntry.match(/\((\d+) KB\)/) || [])[1] || 0)
const panelChunks = assets.filter((n) => /PanelVendedor|VistaCargarVenta|SellerOrders|SellerCustomers/.test(n))
resultados.push({
  paso: 'bundle desplegado',
  estado: 'ok',
  detalle: `entry ${entry} (${entryKB} KB)${baselineKB ? ` · antes ${baselineKB} KB` : ''} · ${assets.length} chunks`,
  chunks: tamanios,
  panelChunks,
})

// 2) Pantallas de la demo (sin API: datos ficticios locales).
await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
await page.waitForURL(/\/resumen$/, { timeout: 20000 })
await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).getByRole('button', { name: 'Cerrar' }).click({ timeout: 4000 }).catch(() => {})

for (const pantalla of PANTALLAS) {
  const arranque = Date.now()
  await page.goto(`${BASE}${pantalla.ruta}`, { waitUntil: 'commit' })
  await pantalla.listo(page)
  const listoMs = Date.now() - arranque
  const recursos = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).reduce((suma, r) => suma + (r.decodedBodySize || 0), 0))
  const archivo = await shot(page, `demo-${pantalla.id}`)
  resultados.push({
    paso: `demo · ${pantalla.id} (${pantalla.ruta})`,
    estado: 'ok',
    detalle: `listo ${listoMs} ms · JS decodificado ${Math.round(recursos / 1024)} KB`,
    listoMs,
    jsKB: Math.round(recursos / 1024),
    capturas: [archivo],
  })
  console.log(`OK    ${pantalla.id}: ${listoMs} ms · JS ${Math.round(recursos / 1024)} KB`)
}

const resumen = {
  verificado: new Date().toISOString(),
  base: BASE,
  entryKB,
  baselineKB,
  llamadasApi: [...new Set(llamadasApi)],
  resultados,
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(resumen, null, 2)}\n`)
console.log(`\nEntry: ${entryKB} KB${baselineKB ? ` (antes ${baselineKB} KB)` : ''} · pantallas: ${resultados.length - 1} · llamadas al API en la demo: ${resumen.llamadasApi.length}`)

await browser.close()
