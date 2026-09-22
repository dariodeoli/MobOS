// QA post-deploy de impresión (#215/#218) sobre la demo de producción.
//
// Cubre lo que quedó en el dominio después de v1.0.140:
//  1. Comprobante rápido en Vendidos: ícono con tooltip en la fila vendida y
//     respuesta honesta del demo al dispararlo (no hay impresión real).
//  2. Etiquetas del lote: la vista de Traslados y la reimpresión individual
//     desde la recepción en tránsito.
//  3. Bundle desplegado: marcas del comprobante rápido y del lote completo en
//     los assets que carga la app (chunks lazy incluidos).
//  4. Capturas + reporte en docs/qa/impresion-post-140/.
//
// La prueba funcional (80 mm directo y PDF) vive en los e2e
// `vendidos-comprobante-rapido.spec.js` y `traslados-etiquetas-lote.spec.js`.
//
// Uso: node scripts/qa-impresion-post-140.mjs
//   QA_BASE_URL (default https://app.moboss.online) · QA_OUT para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/impresion-post-140')
mkdirSync(SALIDA, { recursive: true })

const MARCAS = {
  'comprobante rápido (#215)': [
    'Comprobante rápido',
    'Imprimir comprobante rápido',
    'La unidad no tiene un pedido asociado.',
  ],
  'etiquetas del lote (#218)': [
    'Reimprimir las etiquetas de todas las unidades del lote',
    'Recibir lote',
    'Recibir todo el lote y elegir depósito destino',
    'No se encontraron las unidades del lote para imprimir.',
  ],
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
  const limpio = String(nombre).replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  const archivo = `${String(contador).padStart(2, '0')}-${limpio}.jpg`
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
await paso('demo: comprobante rápido en Vendidos (ícono + tooltip)', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = version ? version[1] : ''
  await shot('panel-demo')

  await page.goto(`${BASE}/inventario/vendidos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 20000 })
  await shot('vendidos-listado')
  const boton = fila.getByRole('button', { name: /Imprimir comprobante rápido de/ })
  if (!(await boton.count())) throw new Error('la fila vendida no muestra el ícono de comprobante rápido')
  const tooltip = await boton.getAttribute('title')
  if (!/comprobante rápido/i.test(tooltip || '')) throw new Error(`tooltip inesperado: ${tooltip}`)
  await boton.click()
  await esperar(1500)
  const aviso = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  if (!/no tiene un pedido asociado|no está disponible en el demo|Modo demo/i.test(aviso)) throw new Error(`el demo no avisó el resultado: ${aviso.slice(-200)}`)
  await shot('comprobante-rapido-aviso')
  return `v${versionProduccion} · tooltip «${tooltip}» · aviso honesto del demo`
})

await paso('demo: etiquetas del lote (Traslados + recepción en tránsito)', async (shot) => {
  await page.goto(`${BASE}/inventario/traslados`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  await shot('traslados-listado')
  const textoTraslados = await page.locator('body').innerText()
  const lotes = await page.getByTestId('traslado-fila').count()
  if (lotes) {
    const primera = page.getByTestId('traslado-fila').first()
    const etiquetas = primera.getByRole('button', { name: 'Etiquetas', exact: true })
    if (!(await etiquetas.count())) throw new Error('la fila de traslado no ofrece reimprimir etiquetas del lote')
    if (!/Reimprimir las etiquetas de todas las unidades del lote/i.test((await etiquetas.getAttribute('title')) || '')) throw new Error('la acción de lote no tiene el tooltip esperado')
    await shot('traslado-acciones')
  } else if (!/Todavía no hay transferencias/i.test(textoTraslados)) {
    throw new Error('Traslados no muestra ni filas ni el vacío esperado')
  }

  // Reimpresión individual desde la recepción del destino (demo).
  await page.goto(`${BASE}/inventario/transito`, { waitUntil: 'domcontentloaded' })
  await esperar(2200)
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  await shot('transito-listado')
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('button', { name: 'Recibir en sucursal' }).click()
  const llegada = page.getByRole('dialog', { name: 'Recibir equipo en tránsito' })
  await llegada.waitFor({ state: 'visible', timeout: 10000 })
  if (!(await llegada.getByRole('button', { name: 'Reimprimir etiqueta' }).count())) throw new Error('la recepción no ofrece reimprimir la etiqueta')
  await shot('recepcion-reimprimir')
  return `lotes en demo: ${lotes}${lotes ? '' : ' (sin transferencias demo)'} · recepción con reimpresión`
})

await paso('producción: bundle con comprobante rápido y lote completo', async () => {
  for (const ruta of ['/inventario/vendidos', '/inventario/traslados', '/inventario/transito', '/inventario/unidades']) {
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
  const faltantes = []
  for (const [grupo, marcas] of Object.entries(MARCAS)) {
    for (const marca of marcas) if (!codigo.includes(marca)) faltantes.push(`${grupo}: ${marca}`)
  }
  if (faltantes.length) throw new Error(`faltan marcas: ${faltantes.join(' · ')}`)
  return `${assets.size} assets · ${Object.values(MARCAS).flat().length} marcas presentes`
})

await paso('el demo no llama al API real', async () => {
  const deInventario = [...new Set(llamadasApi)].filter((ruta) => /\/api\/(inventory|transfers|stock|print)/.test(ruta))
  if (deInventario.length) throw new Error(`llamó al API real: ${deInventario.slice(0, 4).join(' | ')}`)
  return `0 llamadas de inventario/impresión · ${[...new Set(llamadasApi)].length} al API general del shell`
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  erroresConsola: erroresConsola.length,
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({
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
  `# QA post-deploy de impresión · v${versionProduccion || '?'} (#215/#218)`,
  '',
  `- Base: ${BASE}`,
  `- Fecha: ${new Date().toISOString()}`,
  `- Método: Playwright headless sobre la demo de producción; funcional en los e2e (80 mm + PDF).`,
  '',
  '## Pasos',
  '',
  ...resultados.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Marcas verificadas en los assets desplegados',
  '',
  ...Object.entries(MARCAS).map(([grupo, marcas]) => `- ${grupo}: ${marcas.join(' · ')}`),
  '',
  '## Funcional (e2e del arnés)',
  '',
  '- `vendidos-comprobante-rapido.spec.js`: ícono → trabajo `comprobante` (80 mm) sin abrir la ficha; sin impresora, PDF de respaldo.',
  '- `traslados-etiquetas-lote.spec.js`: lote completo desde Traslados, individual desde la recepción, recepción del lote y PDF de 80 mm.',
  '',
  `Veredicto: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${veredicto.erroresConsola} errores de consola.`,
  '',
]
writeFileSync(join(SALIDA, 'REPORTE.md'), `${lineas.join('\n')}\n`)

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Impresión post-deploy: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${erroresConsola.length} errores de consola`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
