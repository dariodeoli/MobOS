// Ejemplo de las etiquetas de góndola (#97): el HTML que baja «Descargar PDF»
// y el ESC/POS que recibe la térmica, con precios, SKU y código de barras.
//
//   npx vite --port 5278 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5278 node scripts/ejemplo-etiquetas-gondola.mjs
//
// Salida: docs/etiquetas-gondola-ejemplo/ (PDFs + JPG + datos).
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5278'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/etiquetas-gondola-ejemplo')
mkdirSync(SALIDA, { recursive: true })

// Productos de ejemplo (el EAN-13 es válido: la etiqueta sale en EAN nativo).
const PRODUCTOS = [
  { product: { id: 'p1', name: 'iPhone 15 128GB Azul', sku: '7791234567898', pricePyg: 5450000 }, cantidad: 1 },
  { product: { id: 'p2', name: 'AirPods Pro 2', sku: 'IP15-128-AZ', pricePyg: 1250000 }, cantidad: 1 },
  { product: { id: 'p3', name: 'Cable USB-C a Lightning 1 m', sku: 'CABLE-C-L1', pricePyg: 120000 }, cantidad: 2 },
]

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1200 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function htmlDeGondola(items, ancho) {
  return page.evaluate(async ({ items, ancho }) => {
    const { buildProductLabelsHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    return buildProductLabelsHtml(items, { format: `thermal-${ancho}` })
  }, { items, ancho })
}

async function lineasEscpos(items, ancho) {
  return page.evaluate(async ({ items, ancho }) => {
    const mod = await import('/src/lib/printing/tickets.js')
    return mod.ticketEtiquetasProducto(items, { ancho }).lineas()
  }, { items, ancho })
}

async function pdfHtml(nombre, html, anchoMm) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const alto = Math.ceil((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: `HTML ${anchoMm} mm`, bytes: readFileSync(join(SALIDA, `${nombre}.pdf`)).length })
}

async function pdfTermico(nombre, lineas, anchoMm) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0}body{font:9px/1.35 'Menlo','SF Mono',monospace;padding:3mm 2mm}pre{margin:0;font:inherit;white-space:pre;overflow:hidden}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  const alto = Math.ceil((await page.locator('pre').evaluate((el) => el.getBoundingClientRect().height)) / 3.7795275591) + 20
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '1mm', right: '1mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: `ESC/POS ${anchoMm} mm`, bytes: readFileSync(join(SALIDA, `${nombre}.pdf`)).length })
}

try {
  await pdfHtml('etiquetas-gondola-80mm', await htmlDeGondola(PRODUCTOS, 80), 80)
  await pdfHtml('etiquetas-gondola-58mm', await htmlDeGondola(PRODUCTOS, 58), 58)
  await pdfTermico('etiquetas-gondola-80mm-escpos', await lineasEscpos(PRODUCTOS, 80), 80)
  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({ productos: PRODUCTOS, generado: new Date().toISOString() }, null, 2)}\n`)
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Etiquetas de góndola #97: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}`)
