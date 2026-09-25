// Verificación en producción de #246: la tabla de inventario muestra una sola
// línea finita por unidad y ya no repite la variante (capacidad) en una columna
// aparte. Playwright headless contra la demo pública (datos ficticios, sin
// sesión real). Deja capturas y un reporte en docs/qa/246-fila-unica/produccion/.
//
// Uso: node e2e/prod/246-fila-unica.mjs
//   QA_APP (default https://app.moboss.online) · QA_OUT para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const APP = (process.env.QA_APP || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/246-fila-unica/produccion')
mkdirSync(SALIDA, { recursive: true })

// Alto de fila esperado: una línea con target táctil de 44 px como techo.
const ALTO_MAX = 52
const ALTURAS_ENTRE_FILAS = 6 // px de tolerancia entre la más alta y la más baja
const FILAS_MEDIDAS = 12

const resultado = {
  base: APP,
  version: '',
  fecha: new Date().toISOString(),
  metodo: 'Playwright headless (chromium) sobre la demo pública de producción',
  encabezados: [],
  filas: 0,
  alturas: [],
  capacidadesPorFila: [],
  pasos: [],
  erroresConsola: [],
  hallazgos: [],
}
let capturaN = 0

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') resultado.erroresConsola.push(msg.text().slice(0, 220)) })
page.on('pageerror', (error) => resultado.erroresConsola.push(`pageerror: ${error.message.slice(0, 220)}`))

const esperar = (ms) => page.waitForTimeout(ms)
async function captura(nombre, locator) {
  capturaN += 1
  const limpio = String(nombre).replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  const archivo = `${String(capturaN).padStart(2, '0')}-${limpio}.jpg`
  const destino = { path: join(SALIDA, archivo), type: 'jpeg', quality: 80 }
  if (locator) await locator.screenshot(destino)
  else await page.screenshot({ ...destino, quality: 75, fullPage: false })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  try {
    const detalle = await fn(async (nombreCaptura, locator) => { const archivo = await captura(nombreCaptura, locator); capturas.push(archivo); return archivo })
    resultado.pasos.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultado.pasos.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas })
    resultado.hallazgos.push(`${nombre}: ${mensaje}`)
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

await paso('entrada a la demo como dueño', async (shot) => {
  await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
  if (await dueno.count()) await dueno.click()
  else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  resultado.version = version ? version[1] : ''
  await shot('acceso-demo')
  return `versión ${resultado.version || '?'}`
})

await paso('encabezado sin la columna de variante duplicada', async (shot) => {
  await page.goto(`${APP}/inventario/unidades`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(2500)
  const encabezado = page.getByTestId('inventario-encabezado')
  await encabezado.waitFor({ state: 'visible', timeout: 20000 })
  const texto = (await encabezado.innerText()).replace(/\s+/g, ' ').toUpperCase()
  resultado.encabezados = texto.split(' ').filter(Boolean)
  for (const columna of ['PRODUCTO', 'PROVEEDOR', 'COSTO', 'UBICACIÓN', 'ESTADO', 'VERIFICADO', 'ACCIONES']) {
    if (!texto.includes(columna)) throw new Error(`falta la columna ${columna}`)
  }
  if (/MODELO\s*\/\s*VARIANTE/.test(texto)) throw new Error('sigue visible la columna «Modelo / variante»')
  const cuerpo = (await page.locator('body').innerText()).toUpperCase()
  if (cuerpo.includes('MODELO / VARIANTE')) throw new Error('la tabla todavía muestra «Modelo / variante» en el cuerpo')
  await shot('encabezado-sin-variante', encabezado)
  return `columnas: ${resultado.encabezados.join(' · ')}`
})

await paso('filas de una sola línea y alto parejo', async (shot) => {
  const filas = page.getByTestId('inventario-fila')
  await filas.first().waitFor({ state: 'visible', timeout: 20000 })
  resultado.filas = await filas.count()
  if (resultado.filas < 5) throw new Error(`solo ${resultado.filas} filas visibles: no alcanza para medir`)
  const medidas = await filas.evaluateAll((nodos, limite) => nodos.slice(0, limite).map((nodo) => {
    const rect = nodo.getBoundingClientRect()
    const celdas = [...nodo.querySelectorAll('span')].map((celda) => celda.getBoundingClientRect().height)
    return { alto: Math.round(rect.height * 10) / 10, altoCelda: celdas.length ? Math.round(Math.max(...celdas) * 10) / 10 : 0 }
  }), FILAS_MEDIDAS)
  resultado.alturas = medidas.map((medida) => medida.alto)
  const masAlta = Math.max(...resultado.alturas)
  const masBaja = Math.min(...resultado.alturas)
  if (masAlta > ALTO_MAX) throw new Error(`hay filas de ${masAlta} px (máximo ${ALTO_MAX} px): no son de una línea`)
  if (masAlta - masBaja > ALTURAS_ENTRE_FILAS) throw new Error(`alturas desparejas: ${masBaja}–${masAlta} px (tolerancia ${ALTURAS_ENTRE_FILAS} px)`)
  await shot('inventario-filas')
  await shot('fila-1', filas.first())
  return `${resultado.filas} filas · ${FILAS_MEDIDAS} medidas: ${masBaja}–${masAlta} px`
})

await paso('la variante (capacidad) aparece una sola vez por fila', async (shot) => {
  const filas = page.getByTestId('inventario-fila')
  const chequeos = await filas.evaluateAll((nodos, limite) => nodos.slice(0, limite).map((nodo) => {
    const texto = (nodo.innerText || '').replace(/\s+/g, ' ')
    const nombre = nodo.querySelector('b')?.textContent || ''
    const capacidad = (nombre.match(/(\d+)\s?(GB|TB)/i) || [])[0] || ''
    const veces = capacidad ? (texto.match(new RegExp(capacidad.replace(/\s+/g, '\\s*'), 'gi')) || []).length : 0
    const condicion = nodo.querySelector('[title^="Condición"]')?.getAttribute('title') || ''
    return { nombre, capacidad, veces, condicion }
  }), FILAS_MEDIDAS)
  resultado.capacidadesPorFila = chequeos
  const sinCapacidad = chequeos.filter((fila) => !fila.capacidad)
  if (sinCapacidad.length) throw new Error(`hay filas sin capacidad en el nombre: ${sinCapacidad.slice(0, 2).map((fila) => fila.nombre).join(' | ')}`)
  const duplicadas = chequeos.filter((fila) => fila.veces !== 1)
  if (duplicadas.length) throw new Error(`la capacidad se repite: ${duplicadas.slice(0, 2).map((fila) => `${fila.capacidad} ×${fila.veces}`).join(' | ')}`)
  const sinCondicion = chequeos.filter((fila) => !fila.condicion)
  if (sinCondicion.length) throw new Error(`filas sin el punto de condición: ${sinCondicion.slice(0, 2).map((fila) => fila.nombre).join(' | ')}`)
  await shot('filas-variante-unica', filas.first().locator('xpath=..'))
  return `${chequeos.length} filas: capacidad 1 vez y condición presente (p. ej. ${chequeos[0].capacidad} · ${chequeos[0].condicion})`
})

await browser.close()

resultado.veredicto = {
  pasosOk: resultado.pasos.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultado.pasos.length,
  hallazgos: resultado.hallazgos.length,
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(resultado, null, 2)}\n`)

const reporte = [
  '# Verificación en producción · #246 fila única y sin variante duplicada',
  '',
  `- Base: ${APP}`,
  `- Versión desplegada: v${resultado.version || '?'}`,
  `- Fecha: ${resultado.fecha}`,
  `- Método: ${resultado.metodo}`,
  `- Filas medidas: ${resultado.alturas.length} de ${resultado.filas} visibles · alturas: ${resultado.alturas.join(', ')} px`,
  '',
  '## Pasos',
  '',
  ...resultado.pasos.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Hallazgos',
  '',
  ...(resultado.hallazgos.length ? resultado.hallazgos.map((texto) => `- ${texto}`) : ['- Sin hallazgos: la tabla cumple los dos criterios de #246 en producción.']),
  '',
]
writeFileSync(join(SALIDA, 'REPORTE.md'), `${reporte.join('\n')}\n`)

const fallos = resultado.pasos.filter((fila) => fila.estado !== 'ok')
console.log(`#246 producción: ${resultado.veredicto.pasosOk}/${resultado.veredicto.pasosTotal} pasos OK · alturas ${resultado.alturas.join('/')} px · ${resultado.hallazgos.length} hallazgos`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
