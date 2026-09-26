// Ejemplo de la lista de compra del abastecimiento (#250 §11) para mostrarle a
// Dario: el rollo de 80 mm, la hoja A4, el ESC/POS que recibe la térmica y la
// variante con el QR del panel, con una compra realista (prioridades, orígenes,
// prometidas, pedidos e IMEI cargados/pendientes).
//
//   npx vite --port 5279 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5279 node scripts/ejemplo-lista-compra.mjs
//
// Salida: docs/lista-compra-ejemplo/ (PDFs + JPG + QR + datos).
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5279'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/lista-compra-ejemplo')
mkdirSync(SALIDA, { recursive: true })

const BASE_APP = 'https://app.moboss.online'
const HOY = new Date('2026-09-26T09:30:00Z')
// El enlace del panel es el contrato del manifiesto (`/envio/<token>`); el QR
// solo sale con un enlace explícito (regla de docs/IMPRESION.md §12).
const ENLACE_PANEL = `${BASE_APP}/envio/ENV-CDE-ASU-0021`

// Forma real de `GET /api/supply/purchases` + lo que pasa el panel
// (`productos` y `necesidades`), como documenta docs/LISTA-COMPRA.md.
const COMPRA = {
  id: 'com-demo-1',
  code: 'COM-CDE-0048',
  status: 'COMPRADA',
  supplierName: 'Mayorista Apple PY',
  reference: 'Factura 001-002',
  notes: 'Retirar antes del mediodía en CDE.',
  branch: { id: 'b-asu', name: 'Casa Central' },
  createdBy: { name: 'Lucía Benítez' },
  lines: [
    { id: 'l-1', productId: 'p-pro', condition: 'USED', quantity: 2, needId: 'n-1', serials: [{ serial: '351500000000004' }] },
    { id: 'l-2', productId: 'p-pro', condition: 'USED', quantity: 1, needId: 'n-2', serials: [] },
    { id: 'l-3', productId: 'p-air', condition: 'NEW', quantity: 5, needId: 'n-3', serials: [{ serial: 'AUR0001000000003' }, { serial: 'AUR0001000000011' }] },
    { id: 'l-4', productId: 'p-cable', condition: 'NEW', quantity: 10, needId: null, serials: [] },
  ],
}

const PRODUCTOS = [
  { id: 'p-pro', name: 'iPhone 15 Pro Max', capacity: '256 GB', color: 'Titanio Natural' },
  { id: 'p-air', name: 'AirPods Pro 2', color: 'Blanco' },
  { id: 'p-cable', name: 'Cable USB-C a Lightning 1 m', color: 'Blanco' },
]

const NECESIDADES = [
  { id: 'n-1', priority: 'URGENTE', source: 'SALE_NO_STOCK', promisedAt: '2026-09-27T00:00:00Z', orderNumber: 'PV-000123' },
  { id: 'n-2', priority: 'NORMAL', source: 'BELOW_REORDER' },
  { id: 'n-3', priority: 'ALTA', source: 'RESERVATION_NO_STOCK', promisedAt: '2026-09-29T00:00:00Z', orderNumber: 'PV-000131' },
]

const OPCIONES = { productos: PRODUCTOS, necesidades: NECESIDADES, origen: 'CDE', emisor: 'Móvil Center (demo)', ahora: HOY }

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function datosDe(opciones) {
  return page.evaluate(async ({ compra, opciones }) => {
    const { datosListaCompra } = await import('/src/lib/printing/listaCompra.js')
    return datosListaCompra(compra, { ...opciones, ahora: new Date(opciones.ahora) })
  }, { compra: COMPRA, opciones })
}

async function htmlDe(datos, formato) {
  return page.evaluate(async ({ datos, formato }) => {
    const { buildListaCompraHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    return buildListaCompraHtml(datos, { format: formato })
  }, { datos, formato })
}

async function lineasEscpos(datos, ancho) {
  return page.evaluate(async ({ datos, ancho }) => {
    const { ticketListaCompra } = await import('/src/lib/printing/tickets.js')
    return ticketListaCompra(datos, { ancho }).lineas()
  }, { datos, ancho })
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
  const paginas = readFileSync(join(SALIDA, `${nombre}.pdf`)).toString('latin1').split('/Type /Page').length - readFileSync(join(SALIDA, `${nombre}.pdf`)).toString('latin1').split('/Type /Pages').length
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: formato === 'a4' ? 'A4' : formato, paginas })
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
  const datos = await datosDe(OPCIONES)
  await pdfHtml('lista-compra-80mm', await htmlDe(datos, 'thermal-80'), 'thermal-80')
  await pdfHtml('lista-compra-a4', await htmlDe(datos, 'a4'), 'a4')
  await pdfTermico('lista-compra-80mm-escpos', await lineasEscpos(datos, 80), 80)

  // Variante con enlace público (contrato del panel): el QR reemplaza al código
  // en barras y se guarda el PNG para escanear.
  const datosEnlace = await datosDe({ ...OPCIONES, enlace: ENLACE_PANEL })
  const htmlEnlace = await htmlDe(datosEnlace, 'a4')
  await pdfHtml('lista-compra-a4-con-enlace', htmlEnlace, 'a4')
  const qr = (htmlEnlace.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
  if (!qr) throw new Error('la variante con enlace no trae el QR del panel')
  writeFileSync(join(SALIDA, 'qr-panel.png'), Buffer.from(qr, 'base64'))
  pasos.push({ documento: 'qr-panel', archivo: 'qr-panel.png', formato: 'QR', enlace: ENLACE_PANEL })

  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({
    compra: { code: datos.code, estado: datos.estado, proveedor: datos.proveedor, recorrido: datos.recorrido, comprador: datos.comprador, referencia: datos.referencia },
    lineas: datos.lineas.map((linea) => ({ producto: linea.producto, variante: linea.variante, condicion: linea.condicion, cantidad: linea.cantidad, prioridad: linea.prioridad?.etiqueta || null, origenes: linea.origenes, prometida: linea.prometidaTexto, pedidos: linea.pedidos, conImei: linea.conImei, pendientes: linea.pendientes })),
    resumen: datos.resumen,
    enlaceDemo: ENLACE_PANEL,
    generado: new Date().toISOString(),
  }, null, 2)}\n`)
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Lista de compra #250 §11: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.enlace ? ` (${paso.enlace})` : ''}`)
