// Evidencia del rediseño de imprimibles (#206): renderiza cada documento a PDF
// por tamaño y guarda su captura, con los MISMOS builders que usa la app.
//
// Los builders viven en módulos del front (alias `@/`, JSX), así que el script
// corre contra el server local (vite) e importa los módulos dentro de la página:
//   npx vite --port 5273 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5273 node scripts/qa-206-imprimibles.mjs
// `QA_SOLO=doc1,doc2` regenera solo esos documentos y conserva el resto de
// resultados.json (para retoques puntuales de un imprimible).
// Salida: docs/qa/206-imprimibles/*.pdf + *.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5273'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/206-imprimibles')
const SOLO = new Set((process.env.QA_SOLO || '').split(',').map((nombre) => nombre.trim()).filter(Boolean))
const incluir = (nombre) => !SOLO.size || SOLO.has(nombre)
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
const resumen = { etiqueta: '21/09/2026 al 21/09/2026', ventas: 12, total: 9800000, ticket: 816667, cobrado: 8200000, pendiente: 1600000, comision: 240000, gastos: 150000, topProductos: [{ nombre: 'iPhone 13 128GB', cantidad: 3, montoPyg: 12600000 }], medios: [{ medio: 'Efectivo', monto: 5000000 }, { medio: 'Transferencia', monto: 3200000 }] }
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

async function lineasDe(funcion, argumentos = [], modulo = '/src/lib/printing/tickets.js') {
  return page.evaluate(async ({ funcion, argumentos, modulo }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    const ticket = mod[funcion](...argumentos)
    return ticket.lineas()
  }, { funcion, argumentos, modulo })
}

// Firmas y aclaraciones (#206): los documentos firmables tienen que reservar
// altura real (A4: 18 mm sobre la línea; térmicos: 3 avances + línea ancha),
// pedir aclaración, CI y fecha, y dejar observaciones. Acá se mide lo generado
// y se marca el documento en fallo si no cumple.
const ROLES_ESPERADOS = {
  'nota-entrega': ['Recibí conforme'],
  remision: ['Entregué', 'Recibí conforme'],
  'recibo-interno': ['Entregué / cobré', 'Recibí conforme'],
  proforma: ['Aceptación del cliente'],
  'cierre-caja': ['Responsable del arqueo', 'Control'],
  'resumen-dia': ['Responsable', 'Control'],
}
const baseDe = (nombre) => nombre.replace(/-(a4|termico-\d+)$/, '')
const normalizarRol = (rol) => String(rol || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()

function validarFirmas(nombre, medida) {
  const esperados = ROLES_ESPERADOS[baseDe(nombre)]
  if (!esperados) return ''
  if (!medida || !medida.firmas.length) return 'no se encontró el bloque de firma'
  const roles = medida.firmas.map((firma) => normalizarRol(firma.rol))
  for (const esperado of esperados) {
    if (!roles.includes(esperado)) return `falta la firma «${esperado}» (encontradas: ${roles.join(', ') || 'ninguna'})`
  }
  for (const firma of medida.firmas) {
    if (medida.termico) {
      if (!firma.lineaAncha) return `falta la línea ancha de firma en «${firma.rol}»`
      if (firma.avancesMm < 12) return `la firma «${firma.rol}» reserva ${firma.avancesMm} mm (mínimo 12 mm)`
      if (!firma.aclaracion) return `falta la aclaración en «${firma.rol}»`
    } else {
      if (firma.espacioMm < 17.5) return `la firma «${firma.rol}» reserva ${firma.espacioMm} mm (mínimo 17,5 mm)`
      const texto = firma.campos.join(' ')
      if (!texto.includes('Aclaración:')) return `falta la aclaración en «${firma.rol}»`
      if (!texto.includes('CI:')) return `falta la CI en «${firma.rol}»`
      if (!texto.includes('Fecha:')) return `falta la fecha en «${firma.rol}»`
    }
  }
  if (medida.termico) return medida.observaciones.length ? '' : 'falta el área de observaciones'
  const observaciones = medida.observaciones[0]
  if (!observaciones || observaciones.lineas < 2) return 'el área de observaciones no tiene dos líneas'
  if (observaciones.altoLineaMm && observaciones.altoLineaMm < 10) return `la línea de observaciones mide ${observaciones.altoLineaMm} mm`
  return ''
}

function registrar(nombre, formato, medida) {
  const problema = validarFirmas(nombre, medida)
  if (problema) {
    resultados.push({ documento: nombre, formato, estado: 'fallo', detalle: problema, firmas: medida })
    console.log(`FALLO ${nombre}: ${problema}`)
  } else {
    resultados.push({ documento: nombre, formato, estado: 'ok', ...(medida ? { firmas: medida } : {}) })
    console.log(`OK    ${nombre}`)
  }
}

// Mide el bloque de firma del HTML ya cargado en la página (sin `document`).
async function medirFirmasHtml() {
  const firmas = await page.locator('.firma').evaluateAll((nodos) => nodos.map((firma) => {
    const rol = firma.querySelector('.rol')
    const caja = (nodo) => nodo.getBoundingClientRect()
    return {
      rol: rol?.textContent.trim() || '',
      espacioMm: rol ? Math.round(((caja(rol).top - caja(firma).top) / 3.7795275591) * 10) / 10 : 0,
      campos: [...firma.querySelectorAll('.campos')].map((campo) => campo.textContent.trim()),
    }
  }))
  const observaciones = await page.locator('.observaciones').evaluateAll((areas) => areas.map((area) => {
    const linea = area.querySelector('.linea')
    return {
      label: area.querySelector('.label')?.textContent.trim() || '',
      lineas: area.querySelectorAll('.linea').length,
      altoLineaMm: linea ? Math.round((linea.getBoundingClientRect().height / 3.7795275591) * 10) / 10 : 0,
    }
  }))
  return firmas.length || observaciones.length ? { firmas, observaciones } : null
}

// Mide el bloque de firma de un ticket ESC/POS a partir del espejo de líneas.
function medirFirmasLineas(lineas) {
  const firmas = []
  for (let i = 0; i < lineas.length; i += 1) {
    const texto = lineas[i].trim()
    if (!/:\s*$/.test(texto)) continue
    const rol = normalizarRol(texto.replace(/:$/, ''))
    if (!Object.values(ROLES_ESPERADOS).flat().includes(rol)) continue
    const siguientes = lineas.slice(i + 1, i + 7).join('')
    firmas.push({
      rol,
      avancesMm: Math.round((((lineas[i + 1] || '').split('\n').length - 1) * 4.23) * 10) / 10,
      lineaAncha: /^\s*-+$/.test((lineas[i + 2] || '').trim()),
      campos: [lineas[i + 3], lineas[i + 4], lineas[i + 5]].filter(Boolean).map((linea) => linea.trim()),
      aclaracion: siguientes.includes('Aclaración:'),
    })
  }
  const observaciones = lineas.join('\n').includes('Observaciones:')
    ? [{ label: 'Observaciones', lineas: 2, altoLineaMm: 0 }]
    : []
  return firmas.length || observaciones.length ? { firmas, observaciones, termico: true } : null
}

// PDF A4 + captura, con el HTML tal como sale de la app.
async function a4(nombre, html) {
  if (!incluir(nombre)) return
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  const medida = await medirFirmasHtml()
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 70, fullPage: true })
  registrar(nombre, 'A4', medida)
}

// PDF térmico: las líneas ESC/POS en una columna monoespaciada del ancho real.
async function termico(nombre, lineas, ancho) {
  if (!incluir(nombre)) return
  const alto = Math.max(120, lineas.length * 5.2 + 20)
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:${ancho}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;font:12px/1.35 'Menlo','SF Mono',monospace;white-space:pre-wrap;padding:4mm;color:#000}pre{margin:0;font:inherit;white-space:pre-wrap}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${ancho}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '2mm', right: '2mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 70, fullPage: true })
  registrar(nombre, `térmico ${ancho} mm`, medirFirmasLineas(lineas))
}

try {
  // Comprobante de pedido: 3 niveles × A4 y térmico 58/80.
  for (const nivel of ['rapido', 'completo', 'detallado']) {
    await a4(`comprobante-${nivel}-a4`, await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildOrderReceiptHtml', pedido, { format: 'a4', level: nivel }))
    for (const ancho of [58, 80]) {
      await termico(`comprobante-${nivel}-termico-${ancho}`, await lineasDe('ticketComprobante', [pedido, { ancho, nivel, link: '' }]), ancho)
    }
  }
  // Documentos no fiscales: A4 (con firmas y observaciones) + térmico 58/80.
  await a4('nota-entrega-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildDeliveryNoteHtml', pedido, { format: 'a4' }))
  await a4('remision-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildRemisionHtml', transferencia, { format: 'a4' }))
  await a4('recibo-interno-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildInternalReceiptHtml', pago, pedido, { format: 'a4' }))
  await a4('proforma-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildProformaHtml', cotizacion, { format: 'a4' }))
  for (const ancho of [58, 80]) {
    await termico(`nota-entrega-termico-${ancho}`, await lineasDe('ticketNotaEntrega', [pedido, { ancho }]), ancho)
    await termico(`remision-termico-${ancho}`, await lineasDe('ticketRemision', [transferencia, { ancho }]), ancho)
    await termico(`recibo-interno-termico-${ancho}`, await lineasDe('ticketReciboInterno', [pago, pedido, { ancho }]), ancho)
    await termico(`proforma-termico-${ancho}`, await lineasDe('ticketProforma', [cotizacion, { ancho }]), ancho)
  }
  // Reportes de caja/resumen: A4 (HTML) y los tickets térmicos que salen por la
  // impresora directa, con el mismo bloque de firma (#206).
  await a4('cierre-caja-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildCierreCajaHtml', cierre, { format: 'a4' }))
  await a4('resumen-dia-a4', await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildResumenDiaHtml', resumen, { format: 'a4' }))
  for (const ancho of [58, 80]) {
    await termico(`cierre-caja-termico-${ancho}`, await lineasDe('ticketCierreCaja', [cierre, { ancho }], '/src/lib/printing/reportes.js'), ancho)
    await termico(`resumen-dia-termico-${ancho}`, await lineasDe('ticketResumenDia', [resumen, { ancho }], '/src/lib/printing/reportes.js'), ancho)
  }
  // Etiquetas (QR + código de barras) en los dos anchos.
  for (const ancho of [58, 80]) {
    await termico(`etiqueta-producto-${ancho}`, await lineasDe('ticketEtiquetaProducto', [producto, { ancho }]), ancho)
    await termico(`etiqueta-unidad-${ancho}`, await lineasDe('ticketEtiquetaUnidad', [unidad, { ancho }]), ancho)
  }
  // IMEI (#203): térmico (impresión directa) y A4 de respaldo.
  const resumenImeiDemo = { imei: '•••••••••••5673', etiqueta: 'Verificado', detalle: 'IMEI verificado: sin reportes', fecha: '2026-09-21T15:04:00Z', fechaTexto: '21/09/2026 15:04', fuente: 'IMEIcheck.net', simulado: true, campos: [{ etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' }] }
  await termico('imei-termico-80', await lineasDe('ticketVerificacionImei', [resumenImeiDemo, { ancho: 80 }]), 80)
  await a4('imei-a4', await htmlDe('/src/lib/imeiComprobante.js', 'htmlComprobanteImei', resumenImeiDemo, { tienda: 'Móvil Center' }))
} catch (error) {
  resultados.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

// Con QA_SOLO, conserva las filas de los documentos que no se regeneraron.
let previos = []
try { previos = JSON.parse(readFileSync(join(SALIDA, 'resultados.json'), 'utf8')).resultados || [] } catch { /* sin evidencia previa */ }
const porDocumento = new Map(previos.map((fila) => [fila.documento, fila]))
for (const fila of resultados) porDocumento.set(fila.documento, fila)

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados: [...porDocumento.values()] }, null, 2)}\n`)
const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Imprimibles: ${resultados.length - fallos.length}/${resultados.length} OK`)
if (fallos.length) { console.error(fallos.map((fila) => `${fila.documento}: ${fila.detalle}`).join('\n')); process.exitCode = 1 }
