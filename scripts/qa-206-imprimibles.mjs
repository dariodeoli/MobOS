// Evidencia del rediseño de imprimibles (#206): renderiza cada documento a PDF
// por tamaño y guarda su captura, con los MISMOS builders que usa la app.
//
// Los builders viven en módulos del front (alias `@/`, JSX), así que el script
// corre contra el server local (vite) e importa los módulos dentro de la página:
//   npx vite --port 5273 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5273 node scripts/qa-206-imprimibles.mjs
// Salida: docs/qa/206-imprimibles/*.pdf + *.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5273'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/206-imprimibles')
mkdirSync(SALIDA, { recursive: true })

const hoy = new Date('2026-09-21T15:04:00Z').toISOString()
const pedido = {
  id: 'ord-1',
  orderNumber: 'MOB-#0042',
  createdAt: hoy,
  deliveryType: 'Delivery',
  deliveryNotes: 'Tocar timbre 2B',
  deliveryAddress: { address: 'Av. Mcal. López 1234', city: 'Asunción', department: 'Central' },
  tenant: { name: 'Móvil Center' },
  branch: { name: 'Casa central' },
  customer: { name: 'Ana Gómez', document: '3.456.789', phone: '981123456', countryCode: '+595' },
  seller: { name: 'Lucía' },
  items: [
    { description: 'iPhone 13 128GB', quantity: 1, unitPricePyg: 4200000, totalPyg: 4200000, serial: '356789012345678' },
    { description: 'Funda silicona', quantity: 2, unitPricePyg: 85000, totalPyg: 170000 },
  ],
  payments: [{ method: 'CASH', status: 'CONFIRMED', amountPyg: 3000000, paidAt: hoy, reference: 'Caja 1' }],
  subtotalPyg: 4370000,
  discountPyg: 70000,
  totalPyg: 4300000,
  paidPyg: 3000000,
  pendingPyg: 1300000,
  publicToken: 'demo-publico',
  status: 'READY',
}
const transferencia = {
  id: 'tr-1',
  createdAt: hoy,
  sourceBranch: { name: 'Casa central' },
  destinationBranch: { name: 'Shopping' },
  destinationLocation: { name: 'Depósito 2' },
  createdBy: { name: 'Dario' },
  aexGuide: 'A003526979',
  notes: 'Entregar antes de las 18:00',
  lines: [
    { sourceProduct: { name: 'iPhone 14' }, quantity: 1, serials: ['356789012345678'] },
    { sourceProduct: { name: 'Funda silicona' }, quantity: 2, serials: ['SN-0001', 'SN-0002'] },
  ],
}
const pago = { id: 'pay-9876', amountPyg: 450000, method: 'TRANSFER', reference: 'Itaú 000123', paidAt: hoy, settlesAt: hoy, receiptNumber: 'MOB-#0042-9876' }
const cotizacion = { id: 'q-1', number: 'COT-2026-0042', createdAt: hoy, validUntil: '2026-10-05T00:00:00Z', customer: pedido.customer, seller: { name: 'Lucía' }, tenant: { name: 'Móvil Center' }, subtotalPyg: 4370000, discountPyg: 70000, totalPyg: 4300000, notes: 'Incluye lámina de regalo.', items: pedido.items }
const cierre = { estado: 'CLOSED', abiertoEn: hoy, cerradoEn: hoy, empresa: 'Móvil Center', sucursal: 'Casa central', usuario: 'Dario', apertura: 500000, totalCobros: 3200000, esperado: 3700000, contado: 3685000, diferencia: -15000, cobrosFecha: hoy, cobros: [{ label: 'Efectivo', montoPyg: 2000000, count: 4 }, { label: 'Transferencia', montoPyg: 1200000, count: 2 }], movimientos: [{ descripcion: 'Cobro pedido MOB-#0041', fecha: hoy, direccion: 'IN', montoPyg: 1200000, cuenta: 'Itaú' }] }
const resumen = { desde: hoy, hasta: hoy, ventas: 12, facturado: 9800000, ticketPromedio: 816667, cobrado: 8200000, pendiente: 1600000, comision: 240000, gastos: 150000, topProductos: [{ nombre: 'iPhone 13 128GB', cantidad: 3, montoPyg: 12600000 }], medios: [{ label: 'Efectivo', montoPyg: 5000000 }] }
const producto = { id: 'p-1', name: 'Funda silicona negra', sku: 'FUN-NEG-01', pricePyg: 85000 }
const unidad = { id: 'u-1', serial: '356789012345678', product: { name: 'iPhone 13 128GB', sku: 'IP13-128' }, pricePyg: 4200000, location: { name: 'Mostrador' }, condition: 'NUEVO' }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const resultados = []
const errar = (error) => { throw error instanceof Error ? error : new Error(String(error)) }

async function htmlDe(modulo, funcion, datos, opciones = {}) {
  const html = await page.evaluate(async ({ modulo, funcion, datos, opciones }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    const fn = mod[funcion]
    if (typeof fn !== 'function') throw new Error(`falta ${funcion} en ${modulo}`)
    return await fn(datos, opciones)
  }, { modulo, funcion, datos, opciones })
  if (!html || !String(html).includes('<')) errar(new Error(`${funcion} no devolvió HTML`))
  return html
}

async function lineasDe(funcion, datos, opciones = {}) {
  return page.evaluate(async ({ funcion, datos, opciones }) => {
    const mod = await import(/* @vite-ignore */ '/src/lib/printing/tickets.js')
    const ticket = mod[funcion](datos, opciones)
    return ticket.lineas()
  }, { funcion, datos, opciones })
}

// PDF A4 + captura, con el HTML tal como sale de la app.
async function a4(nombre, html) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 70, fullPage: true })
  resultados.push({ documento: nombre, formato: 'A4', estado: 'ok' })
}

// PDF térmico: las líneas ESC/POS en una columna monoespaciada del ancho real.
async function termico(nombre, lineas, ancho) {
  const alto = Math.max(120, lineas.length * 5.2 + 20)
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:${ancho}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;font:12px/1.35 'Menlo','SF Mono',monospace;white-space:pre-wrap;padding:4mm;color:#000}pre{margin:0;font:inherit;white-space:pre-wrap}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${ancho}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '2mm', right: '2mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 70, fullPage: true })
  resultados.push({ documento: nombre, formato: `térmico ${ancho} mm`, estado: 'ok' })
}

try {
  // Comprobante de pedido: 3 niveles × A4 y térmico 58/80.
  for (const nivel of ['rapido', 'completo', 'detallado']) {
    await a4(`comprobante-${nivel}-a4`, await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildOrderReceiptHtml', pedido, { format: 'a4', level: nivel }))
    for (const ancho of [58, 80]) {
      await termico(`comprobante-${nivel}-termico-${ancho}`, await lineasDe('ticketComprobante', pedido, { ancho, nivel, link: '' }), ancho)
    }
  }
  // Documentos no fiscales: A4 (con firmas y observaciones) + térmico 58/80.
  await a4('nota-entrega-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildDeliveryNoteHtml', pedido, { format: 'a4' }))
  await a4('remision-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildRemisionHtml', transferencia, { format: 'a4' }))
  await a4('recibo-interno-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildInternalReceiptHtml', pago, pedido, { format: 'a4' }))
  await a4('proforma-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildProformaHtml', cotizacion, { format: 'a4' }))
  for (const ancho of [58, 80]) {
    await termico(`nota-entrega-termico-${ancho}`, await lineasDe('ticketNotaEntrega', pedido, { ancho }), ancho)
    await termico(`remision-termico-${ancho}`, await lineasDe('ticketRemision', transferencia, { ancho }), ancho)
    await termico(`recibo-interno-termico-${ancho}`, await lineasDe('ticketReciboInterno', pago, pedido, { ancho }), ancho)
    await termico(`proforma-termico-${ancho}`, await lineasDe('ticketProforma', cotizacion, { ancho }), ancho)
  }
  // Reportes ejecutivos A4 (consistencia con el resto).
  await a4('cierre-caja-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildCierreCajaHtml', cierre, { format: 'a4' }))
  await a4('resumen-dia-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildResumenDiaHtml', resumen, { format: 'a4' }))
  // Etiquetas (QR + código de barras) en los dos anchos.
  for (const ancho of [58, 80]) {
    await termico(`etiqueta-producto-${ancho}`, await lineasDe('ticketEtiquetaProducto', producto, { ancho }), ancho)
    await termico(`etiqueta-unidad-${ancho}`, await lineasDe('ticketEtiquetaUnidad', unidad, { ancho }), ancho)
  }
  // IMEI (#203) térmico, como cierre del comprobante del cliente.
  await termico('imei-termico-80', await lineasDe('ticketVerificacionImei', { imei: '•••••••••••5673', etiqueta: 'Verificado', detalle: 'IMEI verificado: sin reportes', fechaTexto: '21/09/2026 15:04', fuente: 'IMEIcheck.net', simulado: true }, { ancho: 80 }), 80)
} catch (error) {
  resultados.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)
const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Imprimibles: ${resultados.length - fallos.length}/${resultados.length} OK`)
if (fallos.length) { console.error(fallos.map((fila) => `${fila.documento}: ${fila.detalle}`).join('\n')); process.exitCode = 1 }
