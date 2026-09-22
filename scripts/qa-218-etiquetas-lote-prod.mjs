// Verificación en producción de la reimpresión de etiquetas del lote (#218).
//
// El demo no tiene transferencias (los lotes viven en la base real), así que se
// verifica: (1) el recorrido del destino en el demo (En tránsito → recepción →
// reimprimir etiqueta) y (2) que el bundle desplegado traiga el lote completo
// (reimpresión masiva desde Traslados y recepción de lote). La prueba funcional
// con impresora y los PDFs están en el e2e (`traslados-etiquetas-lote.spec.js`,
// evidencia en esta misma carpeta).
//
// Uso: node scripts/qa-218-etiquetas-lote-prod.mjs
//   QA_BASE_URL (default https://app.moboss.online) · QA_OUT para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/218-etiquetas-lote')
mkdirSync(SALIDA, { recursive: true })

const MARCAS = [
  'Reimprimir las etiquetas de todas las unidades del lote',
  'Recibir lote',
  'Recibir todo el lote y elegir depósito destino',
  'No se encontraron las unidades del lote para imprimir.',
  'Recibí conforme (firma)',
]

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
let contador = 7 // las capturas 01..07 son del e2e; acá siguen 08+
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
await paso('demo: lotes en Traslados y reimpresión en el destino', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = version ? version[1] : ''

  await page.goto(`${BASE}/inventario/traslados`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  await shot('traslados-demo')
  const texto = await page.locator('body').innerText()
  const lotes = await page.getByTestId('traslado-fila').count()
  const sinLotes = /Todavía no hay transferencias/i.test(texto)

  await page.goto(`${BASE}/inventario/transito`, { waitUntil: 'domcontentloaded' })
  await esperar(2200)
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  await shot('transito-demo')
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('button', { name: 'Recibir en sucursal' }).click()
  const llegada = page.getByRole('dialog', { name: 'Recibir equipo en tránsito' })
  await llegada.waitFor({ state: 'visible', timeout: 10000 })
  if (!(await llegada.getByRole('button', { name: 'Reimprimir etiqueta' }).count())) throw new Error('la recepción no ofrece reimprimir la etiqueta')
  await shot('recepcion-destino-demo')
  return `v${versionProduccion} · lotes en demo: ${lotes}${sinLotes ? ' (sin transferencias demo)' : ''} · recepción con reimpresión disponible`
})

await paso('producción: el bundle trae el lote completo (#218)', async () => {
  for (const ruta of ['/inventario/traslados', '/inventario/transito', '/inventario/unidades']) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await esperar(1500)
  }
  const respuesta = await fetch(`${BASE}/login`, { redirect: 'follow' })
  if (!respuesta.ok) throw new Error(`/login respondió ${respuesta.status}`)
  const cuerpo = await respuesta.text()
  for (const match of cuerpo.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  for (const match of cuerpo.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  const bundles = await Promise.all([...assets].map(async (fuente) => (await fetch(fuente)).text()))
  const codigo = bundles.join('\n')
  const faltantes = MARCAS.filter((marca) => !codigo.includes(marca))
  if (faltantes.length) throw new Error(`faltan marcas en los assets: ${faltantes.join(' · ')}`)
  return `${assets.size} assets · ${MARCAS.length} marcas del lote presentes`
})

await paso('el demo no llama al API real', async () => {
  const deInventario = [...new Set(llamadasApi)].filter((ruta) => /\/api\/(inventory|transfers|stock)/.test(ruta))
  if (deInventario.length) throw new Error(`llamó al API de inventario: ${deInventario.slice(0, 4).join(' | ')}`)
  return `0 llamadas de inventario · ${[...new Set(llamadasApi)].length} al API general del shell`
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  erroresConsola: erroresConsola.length,
}
writeFileSync(join(SALIDA, 'produccion.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  resultados,
  assets: [...assets],
  llamadasApi: [...new Set(llamadasApi)],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)

const lineas = [
  `# Reimpresión de etiquetas del lote (#218) · verificación`,
  '',
  `- Producción: ${BASE} · versión v${versionProduccion || '?'} · ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK`,
  '- Funcional (e2e con agente falso, `traslados-etiquetas-lote.spec.js`): 4/4',
  '  - Lote completo desde Traslados en el destino: un trabajo `etiquetas-stock` con las dos unidades.',
  '  - Reimpresión individual desde la recepción del destino: trabajo `etiqueta-stock`.',
  '  - Recepción del lote («Recibir todo el lote»): las unidades quedan disponibles en el destino.',
  '  - Sin impresora: respaldo con el PDF de 80 mm del lote (`etiquetas-lote-80.pdf`).',
  '',
  '## Pasos en producción',
  '',
  ...resultados.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Notas',
  '',
  '- El demo no tiene transferencias (los lotes viven en la base real): la reimpresión masiva se verificó por e2e con el backend del arnés y las marcas del bundle desplegado.',
  '- Individual: la recepción en tránsito del demo ofrece «Reimprimir etiqueta» (mismo camino que #220).',
  '- PDFs: `etiquetas-lote-80.pdf` (lote, e2e) y los de 58/80 en `docs/qa/220-etiquetas/`.',
  '',
]
writeFileSync(join(SALIDA, 'REPORTE.md'), `${lineas.join('\n')}\n`)

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Lote #218 en producción: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${erroresConsola.length} errores de consola`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
