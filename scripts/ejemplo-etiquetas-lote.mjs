// Ejemplo de las etiquetas del lote del abastecimiento (#250 Fase 3 §11) para
// mostrarle a Dario: el rollo de 80 mm (HTML), el ESC/POS que recibe la
// impresora y el PNG que se comparte, con una compra realista de 5 unidades
// (con IMEI cargado y pendientes).
//
//   npx vite --port 5275 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5275 node scripts/ejemplo-etiquetas-lote.mjs
//
// Salida: docs/etiquetas-lote-ejemplo/ (PDFs + JPG + PNG + datos).
// Todo sale del mismo código que usará el panel
// (`src/lib/printing/etiquetaLote.js`, `tickets.js` y `OrderReceipt.jsx`).
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5275'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/etiquetas-lote-ejemplo')
mkdirSync(SALIDA, { recursive: true })

const COMPRA = { id: 'com-demo-1', code: 'COM-CDE-0048', referencia: 'Factura 001-002', proveedor: 'Mayorista Apple PY', destino: 'Casa Central' }
// Misma forma que `etiquetasPreparacion`: una etiqueta por unidad comprada.
const ETIQUETAS = [
  { n: 1, total: 5, producto: 'iPhone 15 Pro Max', capacidad: '256 GB', condicion: 'USED', imei: '351500000000004', pendiente: false, compra: 'COM-CDE-0048', referencia: 'Factura 001-002', pedido: 'PV-000123', destino: 'Casa Central', lote: 'ENV-CDE-ASU-0021' },
  { n: 2, total: 5, producto: 'iPhone 15 Pro Max', capacidad: '256 GB', condicion: 'USED', imei: '351500000000012', pendiente: false, compra: 'COM-CDE-0048', referencia: 'Factura 001-002', pedido: 'PV-000123', destino: 'Casa Central', lote: 'ENV-CDE-ASU-0021' },
  { n: 3, total: 5, producto: 'iPhone 15', capacidad: '128 GB', condicion: 'NEW', imei: '351500000000020', pendiente: false, compra: 'COM-CDE-0048', referencia: 'Factura 001-002', pedido: null, destino: 'Casa Central', lote: 'ENV-CDE-ASU-0021' },
  { n: 4, total: 5, producto: 'iPhone 15', capacidad: '128 GB', condicion: 'NEW', imei: null, pendiente: true, compra: 'COM-CDE-0048', referencia: 'Factura 001-002', pedido: null, destino: 'Casa Central', lote: 'ENV-CDE-ASU-0021' },
  { n: 5, total: 5, producto: 'AirPods Pro 2', capacidad: '', condicion: 'NEW', imei: null, pendiente: true, compra: 'COM-CDE-0048', referencia: 'Factura 001-002', pedido: null, destino: 'Casa Central', lote: 'ENV-CDE-ASU-0021' },
]

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function datosDe(modulo, funcion, argumentos = []) {
  return page.evaluate(async ({ modulo, funcion, argumentos }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    return mod[funcion](...argumentos)
  }, { modulo, funcion, argumentos })
}

async function lineasDe(funcion, argumentos = []) {
  return page.evaluate(async ({ funcion, argumentos }) => {
    const mod = await import(/* @vite-ignore */ '/src/lib/printing/tickets.js')
    return mod[funcion](...argumentos).lineas()
  }, { funcion, argumentos })
}

async function pdfHtml(nombre, html, formato) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const alto = Math.ceil((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${formato.replace('thermal-', '')}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  const paginas = readFileSync(join(SALIDA, `${nombre}.pdf`)).toString('latin1').split('/Type /Page').length
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato, paginas })
}

async function pdfTermico(nombre, lineas, anchoMm) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0}body{font:9px/1.35 'Menlo','SF Mono',monospace;padding:3mm 2mm}pre{margin:0;font:inherit;white-space:pre;overflow:hidden}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  const alto = Math.ceil((await page.locator('pre').evaluate((el) => el.getBoundingClientRect().height)) / 3.7795275591) + 20
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '1mm', right: '1mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: `ESC/POS ${anchoMm} mm`, paginas: 1 })
}

try {
  const html = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildEtiquetasLoteHtml', [ETIQUETAS, { ancho: 80, compra: COMPRA }])
  await pdfHtml('etiquetas-lote-80mm', html, 'thermal-80')
  await pdfTermico('etiquetas-lote-80mm-escpos', await lineasDe('ticketEtiquetasLote', [ETIQUETAS, { ancho: 80, compra: COMPRA }]), 80)

  // La misma etiqueta como PNG (compartir): el camino de `CompartirImagen`.
  const png = await page.evaluate(async ({ etiquetas, compra }) => {
    const { buildEtiquetasLoteHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    const { documentoAPng } = await import('/src/lib/printing/compartirDocumento.js')
    const imagen = await documentoAPng(await buildEtiquetasLoteHtml(etiquetas, { ancho: 80, compra }), { ancho: 'thermal-80' })
    return imagen ? { bytes: imagen.blob.size, dataUrl: imagen.dataUrl } : null
  }, { etiquetas: ETIQUETAS, compra: COMPRA })
  if (!png) throw new Error('no se pudo generar el PNG de las etiquetas')
  writeFileSync(join(SALIDA, 'etiquetas-lote-80mm.png'), Buffer.from(png.dataUrl.split(',')[1], 'base64'))
  pasos.push({ documento: 'etiquetas-lote-80mm-png', archivo: 'etiquetas-lote-80mm.png', formato: 'PNG', bytes: png.bytes })

  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({
    compra: COMPRA,
    etiquetas: ETIQUETAS,
    resumen: { unidades: ETIQUETAS.length, conImei: ETIQUETAS.filter((e) => !e.pendiente).length, pendientes: ETIQUETAS.filter((e) => e.pendiente).length },
    generado: new Date().toISOString(),
  }, null, 2)}\n`)
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Ejemplo etiquetas del lote #250 §11: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.bytes ? ` (${Math.round(paso.bytes / 1024)} KB)` : ''}`)
