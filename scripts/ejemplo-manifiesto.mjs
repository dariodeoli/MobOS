// Ejemplo del manifiesto del envío entrante (#250 §11) y de las etiquetas por
// unidad del lote (`N de M`) para mostrarle a Dario: A4, rollo de 80 mm,
// ESC/POS y la variante con QR de recepción.
//
//   npx vite --port 5280 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5280 node scripts/ejemplo-manifiesto.mjs
//
// Salida: docs/manifiesto-ejemplo/ (PDFs + JPG + QR + datos).
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5280'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/manifiesto-ejemplo')
mkdirSync(SALIDA, { recursive: true })

const BASE_APP = 'https://app.moboss.online'
const HOY = new Date('2026-09-26T09:30:00Z')
// El backend ya arma este enlace (`/envio/<publicToken>`); la página pública
// está pendiente, así que el QR se muestra como contrato (docs/MANIFIESTO.md).
const ENLACE_ENVIO = `${BASE_APP}/envio/ENV-CDE-ASU-0021`

// Forma real de `GET /api/supply/shipments/[id]/manifest` (INV, F4).
const MANIFIESTO = {
  code: 'ENV-CDE-ASU-0021',
  origen: 'CDE',
  destino: 'Casa Central',
  metodo: 'BUS',
  metodoLabel: 'Bus',
  empresa: 'Expreso del Este',
  conductor: 'Ramón Giménez',
  guia: 'A003526979',
  responsable: 'Lucía Benítez',
  estado: 'EN_TRANSITO',
  salida: '2026-09-25T11:00:00Z',
  eta: '2026-09-27T00:00:00Z',
  llegada: null,
  compra: 'COM-CDE-0048',
  proveedor: 'Mayorista Apple PY',
  unidades: 6,
  conImei: 3,
  pendientes: 3,
  lineas: [
    { producto: 'iPhone 15 Pro Max', capacidad: '256 GB', condicion: 'USED', cantidad: 3, imeis: ['351500000000004', '351500000000012'], pendientes: 1 },
    { producto: 'iPhone 15', capacidad: '128 GB', condicion: 'NEW', cantidad: 2, imeis: ['351500000000020'], pendientes: 1 },
    { producto: 'AirPods Pro 2', capacidad: '', condicion: 'NEW', cantidad: 1, imeis: [], pendientes: 1 },
  ],
  enlace: ENLACE_ENVIO,
  notas: 'El resto del lote viaja la semana que viene.',
}

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function datosDe(opciones) {
  return page.evaluate(async ({ manifiesto, opciones }) => {
    const { datosManifiesto } = await import('/src/lib/printing/manifiesto.js')
    return datosManifiesto(manifiesto, { ...opciones, ahora: new Date(opciones.ahora) })
  }, { manifiesto: MANIFIESTO, opciones })
}

async function etiquetasDe(manifiesto) {
  return page.evaluate(async ({ manifiesto }) => {
    const { etiquetasDeLote } = await import('/src/lib/printing/manifiesto.js')
    return etiquetasDeLote(manifiesto)
  }, { manifiesto })
}

async function htmlManifiesto(datos, formato) {
  return page.evaluate(async ({ datos, formato }) => {
    const { buildManifiestoHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    return buildManifiestoHtml(datos, { format: formato })
  }, { datos, formato })
}

async function htmlEtiquetas(etiquetas, ancho) {
  return page.evaluate(async ({ etiquetas, ancho }) => {
    const { buildEtiquetasLoteHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    return buildEtiquetasLoteHtml(etiquetas, { ancho })
  }, { etiquetas, ancho })
}

async function lineasDe(funcion, argumentos) {
  return page.evaluate(async ({ funcion, argumentos }) => {
    const mod = await import('/src/lib/printing/tickets.js')
    return mod[funcion](...argumentos).lineas()
  }, { funcion, argumentos })
}

async function pdfHtml(nombre, html, formato) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  if (formato === 'a4') {
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } else {
    const alto = Math.ceil((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${formato.replace('thermal-', '')}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  }
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  const latin = readFileSync(join(SALIDA, `${nombre}.pdf`)).toString('latin1')
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: formato === 'a4' ? 'A4' : formato, paginas: latin.split('/Type /Page').length - latin.split('/Type /Pages').length })
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
  const datos = await datosDe({ emisor: 'Móvil Center (demo)', ahora: HOY.toISOString() })
  await pdfHtml('manifiesto-a4', await htmlManifiesto(datos, 'a4'), 'a4')
  await pdfHtml('manifiesto-80mm', await htmlManifiesto(datos, 'thermal-80'), 'thermal-80')
  await pdfTermico('manifiesto-80mm-escpos', await lineasDe('ticketManifiesto', [datos, { ancho: 80 }]), 80)

  // Etiquetas por unidad del lote (N de M), con el código ENV-… en el papel.
  const etiquetas = await etiquetasDe(MANIFIESTO)
  await pdfHtml('etiquetas-lote-80mm', await htmlEtiquetas(etiquetas, 80), 'thermal-80')
  await pdfTermico('etiquetas-lote-80mm-escpos', await lineasDe('ticketEtiquetasLote', [etiquetas, { ancho: 80 }]), 80)

  // Variante con el enlace público (contrato del QR de recepción).
  const datosEnlace = await datosDe({ emisor: 'Móvil Center (demo)', enlace: ENLACE_ENVIO, ahora: HOY.toISOString() })
  const htmlEnlace = await htmlManifiesto(datosEnlace, 'a4')
  await pdfHtml('manifiesto-a4-con-enlace', htmlEnlace, 'a4')
  const qr = (htmlEnlace.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
  if (!qr) throw new Error('la variante con enlace no trae el QR')
  writeFileSync(join(SALIDA, 'qr-envio.png'), Buffer.from(qr, 'base64'))
  pasos.push({ documento: 'qr-envio', archivo: 'qr-envio.png', formato: 'QR', enlace: ENLACE_ENVIO })

  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({
    envio: { code: datos.code, estado: datos.estado, recorrido: datos.recorrido, metodo: datos.metodo, empresa: datos.empresa, conductor: datos.conductor, guia: datos.guia, responsable: datos.responsable, compra: datos.compra, proveedor: datos.proveedor },
    resumen: datos.resumen,
    lineas: datos.lineas.map((linea) => ({ producto: linea.producto, capacidad: linea.capacidad, condicion: linea.condicion, cantidad: linea.cantidad, imeis: linea.imeis.length, pendientes: linea.pendientes })),
    etiquetas: etiquetas.map((fila) => ({ n: fila.n, total: fila.total, producto: fila.producto, imei: fila.imei, pendiente: fila.pendiente, lote: fila.lote })),
    enlaceDemo: ENLACE_ENVIO,
    generado: new Date().toISOString(),
  }, null, 2)}\n`)
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Manifiesto #250 §11: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.enlace ? ` (${paso.enlace})` : ''}`)
