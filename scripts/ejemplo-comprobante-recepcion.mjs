// Ejemplo del comprobante de recepción del abastecimiento (#250 Fase 5 §11)
// para mostrarle a Dario: PDFs en A4 y 80 mm con una recepción realista
// (parcial, con dañado, faltante y sobrante) del envío CDE → Asunción.
//
//   npx vite --port 5274 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5274 node scripts/ejemplo-comprobante-recepcion.mjs
//
// Salida: docs/comprobante-recepcion-ejemplo/ (PDFs + JPG + QR + datos).
// Los documentos los genera el mismo código que usará el panel
// (`src/lib/printing/comprobanteRecepcion.js`, `tickets.js` y `OrderReceipt.jsx`),
// así que lo que se ve acá es lo que sale por la impresora o por «Descargar PDF».
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5274'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/comprobante-recepcion-ejemplo')
mkdirSync(SALIDA, { recursive: true })

const BASE_APP = 'https://app.moboss.online'
const HOY = new Date('2026-09-24T18:40:00Z')

// Enlace público del lote: es el que ya emite `manifiestoEnvio` en el backend
// (`/envio/<publicToken>`). La página todavía no está cerrada; acá se muestra
// el contrato cuando exista (la salida principal imprime barras).
const ENLACE_PANEL = `${BASE_APP}/envio/ENV-CDE-ASU-0021`

const PRODUCTOS = [
  { id: 'p-pro-max', name: 'iPhone 15 Pro Max', capacity: '256 GB', color: 'Titanio Natural' },
  { id: 'p-iphone-15', name: 'iPhone 15', capacity: '128 GB', color: 'Azul' },
  { id: 'p-airpods', name: 'AirPods Pro 2', color: 'Blanco' },
]

// Forma real de `GET /api/supply/receptions?id=`: recepción confirmada con su
// envío (compra, líneas e items esperados) y los items escaneados.
const RECEPCION = {
  id: 'rec-demo-1',
  status: 'CONFIRMADA',
  createdAt: '2026-09-24T18:10:00.000Z',
  receivedAt: '2026-09-24T18:40:00.000Z',
  location: { id: 'loc-d1', name: 'Depósito 1', code: 'D1' },
  receivedBy: { id: 'u-lucia', name: 'Lucía Benítez' },
  notes: 'El iPhone 15 faltante viaja en el próximo lote (viernes).',
  shipment: {
    id: 'ship-demo-1',
    code: 'ENV-CDE-ASU-0021',
    origin: 'CDE',
    method: 'BUS',
    status: 'CON_INCIDENCIA',
    destinationBranch: { id: 'b-asu', name: 'Casa Central' },
    purchase: {
      code: 'COM-CDE-0048',
      supplierName: 'Mayorista Apple PY',
      lines: [
        { id: 'l-1', productId: 'p-pro-max', condition: 'USED', quantity: 2 },
        { id: 'l-2', productId: 'p-iphone-15', condition: 'NEW', quantity: 2 },
        { id: 'l-3', productId: 'p-airpods', condition: 'NEW', quantity: 1 },
      ],
    },
    items: [
      { id: 'si-1', serial: '351500000000004', productId: 'p-pro-max', lineId: 'l-1' },
      { id: 'si-2', serial: '351500000000012', productId: 'p-pro-max', lineId: 'l-1' },
      { id: 'si-3', serial: '351500000000020', productId: 'p-iphone-15', lineId: 'l-2' },
      { id: 'si-4', serial: '351500000000038', productId: 'p-iphone-15', lineId: 'l-2' },
      { id: 'si-5', serial: 'AUR0001000000003', productId: 'p-airpods', lineId: 'l-3' },
    ],
  },
  items: [
    { id: 'ri-1', shipmentItemId: 'si-1', serial: '351500000000004', productId: 'p-pro-max', resultado: 'RECIBIDO', nota: null },
    { id: 'ri-2', shipmentItemId: 'si-2', serial: '351500000000012', productId: 'p-pro-max', resultado: 'DANADO', nota: 'Pantalla rayada en el traslado' },
    { id: 'ri-3', shipmentItemId: 'si-3', serial: '351500000000020', productId: 'p-iphone-15', resultado: 'RECIBIDO', nota: null },
    { id: 'ri-4', shipmentItemId: 'si-4', serial: '351500000000038', productId: 'p-iphone-15', resultado: 'FALTANTE', nota: 'Quedó en CDE, viaja en el próximo lote' },
    { id: 'ri-5', shipmentItemId: 'si-5', serial: 'AUR0001000000003', productId: 'p-airpods', resultado: 'RECIBIDO', nota: null },
    { id: 'ri-6', shipmentItemId: null, serial: '359999999999995', productId: 'p-iphone-15', resultado: 'SOBRANTE', nota: 'No figuraba en el manifiesto' },
  ],
}

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
  if (formato === 'a4') {
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } else {
    const alto = Math.ceil((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${formato.replace('thermal-', '')}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  }
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
  const opciones = { productos: PRODUCTOS, emisor: 'Móvil Center (demo)', ahora: HOY }
  const datos = await datosDe('/src/lib/printing/comprobanteRecepcion.js', 'datosComprobanteRecepcion', [RECEPCION, opciones])

  // Comprobante real: A4 y rollo (HTML) + el ESC/POS que recibe la impresora.
  for (const formato of ['a4', 'thermal-80']) {
    const html = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildComprobanteRecepcionHtml', [datos, { format: formato }])
    await pdfHtml(`comprobante-${formato === 'a4' ? 'a4' : '80mm'}`, html, formato)
  }
  await pdfTermico('comprobante-80mm-escpos', await lineasDe('ticketComprobanteRecepcion', [datos, { ancho: 80 }]), 80)

  // Variante con enlace público: muestra el QR del contrato cuando la ruta del
  // panel esté cerrada (la salida real de hoy usa el código del envío en barras).
  const datosEnlace = await datosDe('/src/lib/printing/comprobanteRecepcion.js', 'datosComprobanteRecepcion', [RECEPCION, { ...opciones, enlace: ENLACE_PANEL }])
  const htmlEnlace = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildComprobanteRecepcionHtml', [datosEnlace, { format: 'a4' }])
  await pdfHtml('comprobante-a4-con-enlace', htmlEnlace, 'a4')
  const qr = (htmlEnlace.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
  if (!qr) throw new Error('la variante con enlace no trae el QR del panel')
  writeFileSync(join(SALIDA, 'qr-panel.png'), Buffer.from(qr, 'base64'))
  pasos.push({ documento: 'qr-panel', archivo: 'qr-panel.png', formato: 'QR', enlace: ENLACE_PANEL })

  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({
    compra: datos.compra,
    envio: datos.envio,
    proveedor: datos.proveedor,
    recorrido: [datos.origen, datos.destino].filter(Boolean).join(' → '),
    metodo: datos.metodo,
    deposito: datos.deposito,
    usuario: datos.usuario,
    estadoLote: datos.estado.etiquetaLote,
    recibidoEl: datos.recibidoEl,
    resumen: datos.resumen,
    lineas: datos.lineas.map((linea) => ({ producto: linea.producto, variante: linea.variante, condicion: linea.condicion, esperado: linea.esperado, recibido: linea.recibido, faltante: linea.faltante, sobrante: linea.sobrante, danado: linea.danado })),
    incidencias: datos.incidencias,
    enlaceDemo: ENLACE_PANEL,
    generado: new Date().toISOString(),
  }, null, 2)}\n`)
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Ejemplo comprobante de recepción #250: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.enlace ? ` (${paso.enlace})` : ''}`)
