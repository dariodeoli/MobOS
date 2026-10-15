// Muestras de los papeles por operación (#426): venta, cambio, devolución,
// recibo de regalo, recepción y ticket de prueba, con el diseño aprobado de la
// venta (logo, empresa completa, CLIENTE, PEDIDO, detalle, Total, PAGO,
// GARANTÍA Y CONDICIONES, QR y pie). Las genera el mismo código de la app.
//
//   npx vite --port 5498 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5498 QA_OUT=/tmp/mobos-recibos2 node scripts/ejemplo-recibos.mjs
//
// Usa el Chrome del sistema (sin descargar navegadores).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5498'
const SALIDA = process.env.QA_OUT || '/tmp/mobos-recibos2'
mkdirSync(SALIDA, { recursive: true })

// Logo de ejemplo (marca cuadrada + nombre): entra completo, sin recortes.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 96" width="360" height="96"><rect x="4" y="4" width="88" height="88" rx="16" fill="#0c8876"/><text x="48" y="68" font-family="Helvetica,Arial,sans-serif" font-size="60" font-weight="800" fill="#fff" text-anchor="middle">M</text><text x="108" y="64" font-family="Helvetica,Arial,sans-serif" font-size="36" font-weight="800" fill="#111418">Móvil Center</text></svg>`

const TENANT = { name: 'Móvil Center S.A.', ruc: '80012345-6', address: 'Av. España 1234', city: 'Asunción', phone: '0971 555 010', email: 'ventas@movilcenter.com.py' }
const BRANCH = { name: 'Sucursal Shopping', address: 'Shopping del Sol, local 24', city: 'Asunción', phone: '0971 555 010' }
const PEDIDO = {
  id: 'ord-42',
  orderNumber: 'MOB-#0042',
  publicToken: 'tok123',
  createdAt: '2026-10-14T12:20:00Z',
  fulfillmentStatus: 'READY_FOR_PICKUP',
  tenant: TENANT,
  branch: BRANCH,
  seller: { name: 'Ana Benítez' },
  customer: { name: 'Juan Pérez', document: '1.234.567', phone: '0983 111 222', countryCode: '+595', email: 'juan@correo.com' },
  subtotalPyg: 9410000,
  discountPyg: 210000,
  deliveryPyg: 50000,
  totalPyg: 9250000,
  items: [
    { description: 'iPhone 15 Pro 256GB Titanio Natural', quantity: 1, unitPricePyg: 8900000, totalPyg: 8900000, serials: ['356938035643809'], warrantyDays: 90 },
    { description: 'Funda MagSafe Silicona', quantity: 2, unitPricePyg: 180000, totalPyg: 360000, warrantyDays: 90 },
    { description: 'Cargador USB-C 20W', quantity: 1, unitPricePyg: 150000, totalPyg: 150000, warrantyDays: 90 },
  ],
  payments: [
    { status: 'CONFIRMED', method: 'CASH', amountPyg: 5000000 },
    { status: 'CONFIRMED', method: 'TRANSFER', amountPyg: 2000000, reference: 'Itaú' },
  ],
}
const NUEVOS = [{ description: 'Samsung Galaxy S24 256GB', quantity: 1, unitPricePyg: 5200000, totalPyg: 5200000, serials: ['352099001761481'] }]

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
      ],
    },
    items: [
      { id: 'si-1', serial: '351500000000004', productId: 'p-pro-max', lineId: 'l-1' },
      { id: 'si-2', serial: '351500000000012', productId: 'p-pro-max', lineId: 'l-1' },
      { id: 'si-3', serial: '351500000000020', productId: 'p-iphone-15', lineId: 'l-2' },
      { id: 'si-4', serial: '351500000000038', productId: 'p-iphone-15', lineId: 'l-2' },
    ],
  },
  items: [
    { id: 'ri-1', shipmentItemId: 'si-1', serial: '351500000000004', productId: 'p-pro-max', resultado: 'RECIBIDO', nota: null },
    { id: 'ri-2', shipmentItemId: 'si-2', serial: '351500000000012', productId: 'p-pro-max', resultado: 'DANADO', nota: 'Pantalla rayada en el traslado' },
    { id: 'ri-3', shipmentItemId: 'si-3', serial: '351500000000020', productId: 'p-iphone-15', resultado: 'RECIBIDO', nota: null },
    { id: 'ri-4', shipmentItemId: 'si-4', serial: '351500000000038', productId: 'p-iphone-15', resultado: 'FALTANTE', nota: 'Quedó en CDE' },
  ],
}
const PRODUCTOS = [
  { id: 'p-pro-max', name: 'iPhone 15 Pro Max', capacity: '256 GB', color: 'Titanio Natural' },
  { id: 'p-iphone-15', name: 'iPhone 15', capacity: '128 GB', color: 'Azul' },
]

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.route('**/api/tenant/logo*', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: LOGO_SVG }))
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

// Empresa de la sesión + logo para los tickets térmicos.
await page.evaluate(async ({ tenant, branch }) => {
  const { fijarEmpresaImpresion } = await import('/src/lib/printing/empresaImpresion.js')
  fijarEmpresaImpresion({ tenant, branch })
  const { cargarLogoImpresion } = await import('/src/lib/printing/logoImpresion.js')
  await cargarLogoImpresion()
}, { tenant: TENANT, branch: BRANCH })

const html = (modulo, funcion, argumentos) => page.evaluate(async ({ modulo, funcion, argumentos }) => (await import(/* @vite-ignore */ modulo))[funcion](...argumentos), { modulo, funcion, argumentos })
const lineas = (funcion, argumentos) => page.evaluate(async ({ funcion, argumentos }) => (await import('/src/lib/printing/tickets.js'))[funcion](...argumentos).lineas(), { funcion, argumentos })
const lineasOperacion = (funcion, argumentos) => page.evaluate(async ({ funcion, argumentos }) => (await import('/src/lib/printing/ticketsOperacion.js'))[funcion](...argumentos).lineas(), { funcion, argumentos })

async function captura(nombre, documento, ancho) {
  await page.setViewportSize({ width: ancho, height: 900 })
  await page.setContent(documento, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  writeFileSync(`${SALIDA}/${nombre}.html`, documento)
  await page.screenshot({ path: `${SALIDA}/${nombre}.png`, fullPage: true })
}

async function capturaTicket(nombre, filas) {
  const texto = filas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  writeFileSync(`${SALIDA}/${nombre}.txt`, `${filas.join('\n')}\n`)
  await captura(nombre, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><pre style="margin:0;padding:10mm 4mm 8mm;font:11px/1.35 Menlo,monospace;white-space:pre;width:max-content">${texto}</pre></body>`, 420)
}

const A4 = 794
const T80 = 302
const pagos = PEDIDO.payments

// Venta (el modelo aprobado).
const venta80 = await html('/src/components/shared/OrderReceipt.jsx', 'buildOrderReceiptHtml', [PEDIDO, { level: 'completo', format: 'thermal-80' }])
await captura('venta-80', venta80, T80 + 60)
await captura('venta-a4', await html('/src/components/shared/OrderReceipt.jsx', 'buildOrderReceiptHtml', [PEDIDO, { level: 'completo', format: 'a4' }]), A4)

// Operaciones.
const enlace = 'https://clientes.moboss.online/pedidos/tok123'
await captura('cambio-80', await html('/src/components/shared/OperacionReceipt.jsx', 'buildCambioHtml', [PEDIDO, { format: 'thermal-80', datos: { devueltos: [PEDIDO.items[0]], nuevos: NUEVOS, medio: 'CASH', fecha: '2026-10-16T15:05:00Z', motivo: 'Cambio de modelo' } }]), T80 + 60)
await captura('devolucion-80', await html('/src/components/shared/OperacionReceipt.jsx', 'buildDevolucionHtml', [PEDIDO, { format: 'thermal-80', datos: { items: [PEDIDO.items[1]], refundPyg: 360000, motivo: 'Funda defectuosa', fecha: '2026-10-16T15:05:00Z' } }]), T80 + 60)
await captura('regalo-80', await html('/src/components/shared/OperacionReceipt.jsx', 'buildReciboRegaloHtml', [PEDIDO, { format: 'thermal-80' }]), T80 + 60)
await captura('devolucion-a4', await html('/src/components/shared/OperacionReceipt.jsx', 'buildDevolucionHtml', [PEDIDO, { format: 'a4', datos: { items: [PEDIDO.items[1]], refundPyg: 360000, motivo: 'Funda defectuosa', fecha: '2026-10-16T15:05:00Z' } }]), A4)

// Recepción del abastecimiento (HTML) y su ticket ESC/POS.
const recepcion = await html('/src/lib/printing/comprobanteRecepcion.js', 'datosComprobanteRecepcion', [RECEPCION, { productos: PRODUCTOS, emisor: TENANT.name, enlace: 'https://app.moboss.online/envio/ENV-CDE-ASU-0021', ahora: new Date('2026-09-24T18:40:00Z') }])
await captura('recepcion-80', await html('/src/components/shared/OrderReceipt.jsx', 'buildComprobanteRecepcionHtml', [recepcion, { format: 'thermal-80' }]), T80 + 60)

// Tickets ESC/POS (espejo del papel que sale por la térmica).
await capturaTicket('prueba-80', await lineas('ticketPruebaTipo', ['completa', { ancho: 80, nombre: 'Mostrador', usuario: 'Ana Benítez', equipo: 'Caja 1', puente: 'Mac del local', base: 'https://app.moboss.online' }]))
await capturaTicket('venta-80-escpos', await lineas('ticketComprobante', [PEDIDO, { nivel: 'completo', ancho: 80, link: enlace }]))
await capturaTicket('cambio-80-escpos', await lineasOperacion('ticketCambio', [await html('/src/lib/printing/operacionPapel.js', 'documentoCambio', [PEDIDO, { devueltos: [PEDIDO.items[0]], nuevos: NUEVOS, medio: 'CASH', fecha: '2026-10-16T15:05:00Z', enlace }]), { ancho: 80 }]))
await capturaTicket('devolucion-80-escpos', await lineasOperacion('ticketDevolucion', [await html('/src/lib/printing/operacionPapel.js', 'documentoDevolucion', [PEDIDO, { items: [PEDIDO.items[1]], refundPyg: 360000, motivo: 'Funda defectuosa', fecha: '2026-10-16T15:05:00Z', enlace }]), { ancho: 80 }]))
await capturaTicket('regalo-80-escpos', await lineasOperacion('ticketRegalo', [await html('/src/lib/printing/operacionPapel.js', 'documentoRegalo', [PEDIDO, { enlace }]), { ancho: 80 }]))
await capturaTicket('recepcion-80-escpos', await lineas('ticketComprobanteRecepcion', [recepcion, { ancho: 80 }]))

void pagos
await browser.close()
console.log(`Muestras en ${SALIDA}`)
