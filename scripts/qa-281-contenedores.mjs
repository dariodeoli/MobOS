// Capturas y medición AA de los contenedores de la venta (#281) en claro,
// oscuro y alto contraste (emulación de forced-colors del sistema).
//
// Recorre la demo pública con una venta a medio armar (cliente, dos productos y
// un pago parcial) y guarda la pantalla completa por tema + la medición de
// contraste de cada bloque. Corre contra el dev server (Vite):
//
//   npx vite --port 5216 --strictPort &
//   QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=antes \
//     QA_OUT=docs/qa/281-contenedores node scripts/qa-281-contenedores.mjs
/* global getComputedStyle, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { auditarContraste } from '../e2e/helpers/contraste.js'
import { cerrarGuiaDemo } from '../e2e/helpers/demo.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'http://localhost:5216').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/qa/281-contenedores'
const ETIQUETA = (process.env.QA_ETIQUETA || 'rama').replace(/[^a-z0-9-]/gi, '')
mkdirSync(SALIDA, { recursive: true })
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Los bloques de la venta que se quieren distinguir de un vistazo. La barra
// compacta solo existe en pantallas angostas.
const BLOQUES = [
  ['Cliente', '[data-testid="pos-bloque-cliente"]'],
  ['Productos', '[data-testid="pos-bloque-productos"]'],
  ['Carrito', '#pos-resumen-venta'],
  ['Pagos', '[data-testid="pos-bloque-pagos"]'],
  ['Tiles', '[data-testid="pos-tiles-resumen"]'],
  ['Barra compacta', '[data-testid="carrito-barra"]'],
]

const VARIANTES = [
  { id: 'claro', tema: 'light', forced: false, movil: true },
  { id: 'oscuro', tema: 'dark', forced: false, movil: true },
  { id: 'alto-contraste', tema: 'light', forced: true, movil: false },
]

const navegador = await chromium.launch()
const resultados = { base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), variantes: [] }

// Deja la venta a medio armar: cliente, dos productos y un pago parcial (los
// tiles de Pagado/Pendiente y el bloque de pagos quedan con contenido real).
async function armarVenta(page) {
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente contenedores ${ETIQUETA}`)
  for (const producto of ['Funda Silicona Negra', 'Cargador USB-C 20W']) {
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(producto)
    await esperar(700)
    await page.getByRole('button', { name: new RegExp(producto) }).first().click()
    await esperar(500)
  }
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await esperar(500)
  const fila = page.getByTestId('pago-fila-0')
  const combo = fila.getByLabel('Cuenta de cobro')
  await combo.click()
  await esperar(300)
  const opcion = page.getByRole('option', { name: /Caja · Guaraníes/ }).first()
  if (await opcion.count()) await opcion.click()
  else await page.keyboard.press('Escape')
  await esperar(400)
  const monto = fila.getByLabel('Monto original')
  await monto.fill('100000')
  await esperar(600)
}

async function capturar(variante, { nombre, viewport, movil }) {
  const contexto = await navegador.newContext({ viewport, deviceScaleFactor: movil ? 2 : 1 })
  if (variante.tema === 'dark') {
    await contexto.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  }
  const page = await contexto.newPage()
  if (variante.forced) await page.emulateMedia({ forcedColors: 'active' })
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1200)
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await cerrarGuiaDemo(page)
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 }).waitFor({ timeout: 25_000 })
  await cerrarGuiaDemo(page)
  await esperar(1200)
  await armarVenta(page)
  await esperar(800)

  const archivo = `${nombre}.jpg`
  // La captura full page con `position: sticky` deja el resumen fijo encima de
  // los bloques: para la evidencia se neutraliza el pegado (el comportamiento
  // real no cambia) y así se ven todos los contenedores en una sola imagen.
  await page.evaluate(() => {
    for (const selector of ['[data-testid="resumen-columna"]', '[data-testid="carrito-barra"]']) {
      for (const nodo of document.querySelectorAll(selector)) nodo.style.position = 'static'
    }
  })
  await esperar(400)
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 74, fullPage: true })

  const bloques = []
  for (const [etiqueta, selector] of BLOQUES) {
    if (await page.locator(selector).count() === 0) { bloques.push({ etiqueta, presente: false }); continue }
    const contraste = await auditarContraste(page, [selector])
    // Datos de identidad: borde y fondo computados del bloque (evidencian el
    // tinte suave y el borde de cada uno más allá de la captura).
    const estilo = await page.locator(selector).first().evaluate((nodo) => {
      const cs = getComputedStyle(nodo)
      return { fondo: cs.backgroundColor, borde: cs.borderTopColor, ancho: cs.borderTopWidth }
    })
    bloques.push({ etiqueta, presente: true, ...estilo, medidos: contraste.medidos, bajosAA: contraste.bajos.length, detalleAA: contraste.bajos.slice(0, 5) })
    console.log(`[281 ${ETIQUETA}] ${variante.id} ${etiqueta} · textos=${contraste.medidos} bajos=${contraste.bajos.length}`)
  }
  await contexto.close()
  return { archivo, viewport: `${viewport.width}x${viewport.height}`, bloques }
}

for (const variante of VARIANTES) {
  const escritorio = await capturar(variante, { nombre: `${variante.id}-pos-desktop-${ETIQUETA}`, viewport: { width: 1440, height: 900 }, movil: false })
  const pasadas = { escritorio }
  if (variante.movil) {
    pasadas.movil = await capturar(variante, { nombre: `${variante.id}-pos-mobile-${ETIQUETA}`, viewport: { width: 390, height: 844 }, movil: true })
  }
  resultados.variantes.push({ variante: variante.id, tema: variante.tema, altoContraste: variante.forced, ...pasadas })
}

writeFileSync(join(SALIDA, `resultados-${ETIQUETA}.json`), JSON.stringify(resultados, null, 2))
const bajos = resultados.variantes.flatMap((v) => [v.escritorio, v.movil].filter(Boolean).flatMap((p) => p.bloques.filter((b) => b.presente && b.bajosAA > 0).map((b) => `${v.variante}/${p.archivo}/${b.etiqueta}: ${b.bajosAA}`)))
console.log(JSON.stringify({ etiqueta: ETIQUETA, capturas: resultados.variantes.flatMap((v) => [v.escritorio, v.movil].filter(Boolean).map((p) => p.archivo)), bajosAA: bajos }))
await navegador.close()
