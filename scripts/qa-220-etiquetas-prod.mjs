// Verificación post-deploy de las etiquetas de unidades (#220) en producción.
//
// El demo no imprime etiquetas (no hay agente/puente y el camino directo avisa
// que es ficticio), así que la verificación combina:
//  1. El bundle desplegado tiene que traer el contenido y los flujos nuevos
//     (modelo, identificador, IMEI legible, QR, barras, reimpresión).
//  2. El recorrido del demo: Inventario → ficha de la unidad → «Etiqueta»,
//     con aviso honesto de que en el demo no se imprime y sin llamadas al API.
//  3. Capturas de la lista y de la ficha.
// Los PDFs por tamaño y los checks de contenido viven en la evidencia local
// (`scripts/qa-220-etiquetas.mjs`, docs/qa/220-etiquetas) porque el diálogo de
// impresión no se abre en el demo.
//
// Uso: node scripts/qa-220-etiquetas-prod.mjs
//   QA_BASE_URL (default https://app.moboss.online) · QA_OUT para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/220-etiquetas-prod')
mkdirSync(SALIDA, { recursive: true })

// Marcas del rediseño #220 que tienen que viajar en el bundle desplegado.
const MARCAS_BUNDLE = [
  'ETIQUETA DE UNIDAD',
  'IDENTIFICADOR',
  'IMEI / SERIAL',
  'CÓDIGO QR',
  'CÓDIGO DE UNIDAD',
  'Escaneá el QR para abrir la unidad o usá el código de barras en el local.',
  'class="bloque"',
  'Reimprimir etiqueta',
  'Imprimir etiquetas',
]

const resultados = []
const llamadasApi = []
const llamadasImpresion = []
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('request', (peticion) => {
  const url = peticion.url()
  if (url.includes('/src/')) return
  if (!/\/api\//.test(url)) return
  const ruta = `${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`
  llamadasApi.push(ruta)
  if (/\/api\/print/.test(url)) llamadasImpresion.push(ruta)
})

const esperar = (ms) => page.waitForTimeout(ms)
let contador = 0
async function captura(nombre, { completa = false } = {}) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72, fullPage: completa })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(async (n, opciones) => { const archivo = await captura(n, opciones); capturas.push(archivo); return archivo })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

await paso('demo: etiqueta desde la ficha de la unidad', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
  if (await dueno.count()) await dueno.click()
  else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1500)

  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const filas = page.getByTestId('inventario-fila')
  if (!(await filas.count())) throw new Error('el demo no muestra unidades de inventario')
  await shot('inventario-demo')
  await filas.first().click()
  await esperar(1200)
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 10000 })
  await shot('ficha-unidad-demo')

  const etiqueta = ficha.getByRole('button', { name: 'Etiqueta', exact: true })
  if (!(await etiqueta.count())) throw new Error('la ficha no ofrece la acción «Etiqueta»')
  await etiqueta.click()
  await esperar(1200)
  await shot('etiqueta-demo-aviso')
  const texto = await ficha.innerText().catch(() => '')
  // En el demo la impresión no está disponible: se avisa, no se abre diálogo.
  if (!/no está disponible en el demo|Modo demo/i.test(texto)) throw new Error('el demo no avisó que la impresión es ficticia')
  if (await page.locator('iframe[aria-hidden="true"]').count()) throw new Error('el demo abrió el diálogo de impresión')
  return 'lista, ficha y aviso de demo capturados'
})

let versionProduccion = ''
await paso('bundle de producción con las etiquetas #220', async () => {
  const respuesta = await fetch(`${BASE}/login`, { redirect: 'follow' })
  if (!respuesta.ok) throw new Error(`/login respondió ${respuesta.status}`)
  const cuerpo = await respuesta.text()
  const delTexto = (await page.locator('body').innerText().catch(() => '')).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = delTexto ? delTexto[1] : ''
  const fuentes = new Set([
    ...[...cuerpo.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => new URL(match[1], BASE).href),
    ...[...cuerpo.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)].map((match) => new URL(match[1], BASE).href),
  ])
  const bundles = await Promise.all([...fuentes].map(async (fuente) => (await fetch(fuente)).text()))
  const codigo = bundles.join('\n')
  const faltantes = MARCAS_BUNDLE.filter((marca) => !codigo.includes(marca))
  if (faltantes.length) throw new Error(`el bundle no trae: ${faltantes.join(' · ')}`)
  return `${MARCAS_BUNDLE.length} marcas de #220 en ${fuentes.size} bundle(s)`
})

await paso('el demo no llama al API de impresión', async () => {
  if (llamadasImpresion.length) throw new Error(`llamadas: ${[...new Set(llamadasImpresion)].slice(0, 5).join(' | ')}`)
  return `0 llamadas a impresión · ${llamadasApi.length} al API general`
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  llamadasImpresion: llamadasImpresion.length,
  erroresConsola: erroresConsola.length,
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  resultados,
  llamadasApi: [...new Set(llamadasApi)],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Etiquetas #220 en producción: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${llamadasImpresion.length} llamadas a impresión · ${erroresConsola.length} errores de consola`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
