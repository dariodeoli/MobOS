import { gs } from '@/utils/calculos'
import { printHtml } from '@/utils/printHtml'
import { APP_NAME } from '@/lib/brand'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { ahorroDeLinea } from '@/utils/precioLista'
import QRCode from 'qrcode'
import { api } from '@/lib/api/client'
import { getLogoDataUrl } from '@/lib/tenantLogo'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))

const publicBase = () =>
  String(import.meta.env.VITE_PUBLIC_TRACKING_URL || '').replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '')

// Remito de traslado entre sucursales: lista completa de IMEI para control
// físico al recibir, con origen, destino, fecha y guía AEX si ya está. Si el
// traslado tiene enlace público, el QR deja confirmar la recepción al destino.
export async function printTransferReceipt(transfer, { format = 'a4' } = {}) {
  const thermal = Boolean(thermalWidth(format))
  const lines = Array.isArray(transfer.lines) ? transfer.lines : []
  const lineas = lines.map((line) => {
    const seriales = Array.isArray(line.serials) ? line.serials : []
    return `<div class="item"><strong>${escapeHtml(line.sourceProduct?.name || 'Producto')} × ${escapeHtml(line.quantity || 1)}</strong>${seriales.length ? `<div class="serials">${seriales.map((serial) => escapeHtml(serial)).join('<br>')}</div>` : ''}</div>`
  }).join('')
  const enlace = transferReceiveUrlFor(transfer?.publicToken)
  let qr = ''
  try { if (enlace) qr = await QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 1, width: 200 }) } catch { /* el enlace queda impreso igual */ }
  const recepcion = enlace ? `${qr ? `<img class="qr" src="${qr}" alt="QR de recepción">` : ''}<p class="small">Confirmá la recepción escaneando el QR o desde ${escapeHtml(enlace)}</p>` : ''
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remito de traslado</title><style>@page{size:${thermal ? '80mm auto' : 'A4'};margin:${thermal ? '4mm' : '16mm'}}body{font:${thermal ? '10px' : '13px'} system-ui,sans-serif;margin:0;color:#111;max-width:${thermal ? '72mm' : '760px'}}h1{font-size:${thermal ? '15px' : '20px'};margin:0 0 4px}.muted{color:#555}.row{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.items{margin:14px 0;border-top:1px dashed #999}.item{padding:8px 0;border-bottom:1px dashed #999}.serials{font-size:9px;line-height:1.5;color:#333;margin-top:4px}.qr{display:block;width:${thermal ? '32mm' : '42mm'};height:${thermal ? '32mm' : '42mm'};margin:12px auto 4px}.small{font-size:10px;word-break:break-all;text-align:center;color:#555}@media print{body{margin:0}}</style></head><body><h1>Remito de traslado</h1><p class="muted">${escapeHtml(transfer.sourceBranch?.name || 'Origen')} → ${escapeHtml(transfer.destinationBranch?.name || 'Destino')} · ${transfer.createdAt ? new Date(transfer.createdAt).toLocaleString('es-PY') : ''}</p><div class="items">${lineas}</div>${transfer.aexGuide ? `<div class="row"><span>Guía AEX</span><span>${escapeHtml(transfer.aexGuide)}</span></div>` : ''}${transfer.createdBy?.name ? `<div class="row"><span>Generado por</span><span>${escapeHtml(transfer.createdBy.name)}</span></div>` : ''}${transfer.receivedAt ? `<div class="row"><span>Recibido</span><span>${escapeHtml(new Date(transfer.receivedAt).toLocaleString('es-PY'))}${transfer.receivedNote ? ` · ${escapeHtml(transfer.receivedNote)}` : ''}</span></div>` : ''}${transfer.notes ? `<p class="muted">${escapeHtml(transfer.notes)}</p>` : ''}${recepcion}</body></html>`
  return printHtml(html)
}

// Etiqueta de precio/góndola: nombre, SKU, precio (y mayorista) con QR que
// abre el producto al escanearlo.
export async function printPriceLabel(product, { format = 'thermal' } = {}) {
  const code = `MOBOS:PROD:${product.sku || product.id || ''}`
  let qr = ''
  try { qr = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 0, width: 140 }) } catch { /* La etiqueta sigue útil sin el QR. */ }
  const precio = Number(product.pricePyg ?? product.precioVenta ?? 0)
  const mayorista = Number(product.wholesalePricePyg ?? 0)
  const thermal = Boolean(thermalWidth(format))
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Precio ${escapeHtml(product.name || product.sku || '')}</title><style>@page{size:58mm auto;margin:2mm}body{width:54mm;margin:0;font-family:Arial,sans-serif;color:#111}.brand{color:#0c8876;font-size:9px;font-weight:900;letter-spacing:1px}.name{font-size:12px;font-weight:800;margin:2mm 0}.sku{font-size:8px;color:#555}.price{font-size:${thermal ? '26px' : '30px'};font-weight:900;margin:2mm 0}.sub{font-size:9px;color:#555}.qr{width:22mm;height:22mm;margin:2mm auto;display:block}</style></head><body><div class="brand">MOBOS · ETIQUETA DE PRECIO</div><div class="name">${escapeHtml(product.name || '')}</div>${product.sku ? `<div class="sku">${escapeHtml(product.sku)}</div>` : ''}<div class="price">${precio > 0 ? `Gs. ${precio.toLocaleString('es-PY')}` : '—'}</div>${mayorista > 0 ? `<div class="sub">Mayorista: Gs. ${mayorista.toLocaleString('es-PY')}</div>` : ''}${qr ? `<img class="qr" src="${qr}" alt="QR">` : ''}</body></html>`
  return printHtml(html)
}

export const trackingUrlFor = (order) => {
  // El QR del comprobante abre la página pública del pedido (estado + garantías).
  const base = publicBase()
  return order?.publicToken && base ? `${base}/pedido/${encodeURIComponent(order.publicToken)}` : ''
}

// Enlace privado del nivel de comprobante (rápido | completo | detallado).
export const accessUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/p/${encodeURIComponent(token)}` : ''
}

// Enlace público de la cotización: el cliente acepta o rechaza desde el QR.
export const quoteUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/cotizacion/${encodeURIComponent(token)}` : ''
}

// Enlace público del remito de traslado: el destino confirma la recepción.
export const transferReceiveUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/remito/${encodeURIComponent(token)}` : ''
}

const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }

const THERMAL_WIDTHS = { 'thermal-80': 80, 'thermal-58': 58, 'thermal-55': 55, thermal: 58 }
const thermalWidth = (format) => THERMAL_WIDTHS[format] || 0
const styles = (format) => {
  const width = thermalWidth(format)
  // Cada formato reserva su propio margen: A4 respira a los lados y arriba/abajo;
  // las térmicas centran la columna en el rollo con padding parejo (el papel
  // suele ser más ancho que el área imprimible real).
  const page = width ? `${width}mm auto` : 'A4'
  const margin = width ? '5mm 4mm' : '18mm 16mm'
  const bodyMax = width ? `${width - 8}mm` : '178mm'
  const baseFont = width ? '10px/1.45' : '13px/1.6'
  const brandSize = width ? '12px' : '13px'
  const h1Size = width ? '15px' : '20px'
  const totalSize = width ? '14px' : '16px'
  const qrSize = width ? `${width === 80 ? 42 : 32}mm` : '42mm'
  return `
  @page{size:${page};margin:${margin}}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:${baseFont} ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;margin:0 auto;color:#0f1720;max-width:${bodyMax};padding:${width ? '1mm 0 6mm' : '0 0 4mm'}}
  .brand{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:2px solid #0c8876;padding-bottom:8px;margin-bottom:14px}
  .brand b{font-size:${brandSize};color:#0c8876;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
  .brand span{font-size:10px;color:#66707a;text-transform:uppercase;letter-spacing:.12em}
  h1{font-size:${h1Size};margin:0 0 2px;letter-spacing:-.01em}
  .muted{color:#66707a}
  .meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 12px;margin:6px 0 0}
  .card{border:1px solid #e3e8ec;border-radius:10px;padding:10px 12px;margin:10px 0}
  .card .label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#66707a;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#66707a;text-align:left;font-weight:600}
  td,th{padding:6px 0;border-bottom:1px dashed #d5dbe0;vertical-align:top}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .totals td{border:0;padding:3px 0}
  .totals tr:last-child td{font-weight:700;font-size:${totalSize};border-top:1px solid #0f1720;padding-top:6px}
  .totals tr.saldo td{font-weight:800;font-size:${totalSize};color:#000;border-top:1px solid #0f1720;padding-top:6px}
  .tag{display:inline-block;border:1px solid #0c8876;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;color:#0c8876}
  .brand img.logo{display:block;height:${width ? (width === 80 ? '14mm' : '12mm') : '16mm'};max-width:${width ? `${width - 20}mm` : '70mm'};object-fit:contain;margin:0 auto 4px}
  .qr{display:block;width:${qrSize};height:${qrSize};margin:10px auto 6px}
  .small{font-size:10px;word-break:break-all;text-align:center}
  .nofiscal{border:2px solid #0f1720;padding:6px 8px;text-align:center;font-weight:800;letter-spacing:.05em;font-size:${width ? '10px' : '11px'};margin:12px 0}
  .firmas{display:flex;flex-wrap:wrap;gap:14px 18px;margin:18px 0 4px;font-size:10px}
  .firma{flex:1 1 40%;border-top:1px solid #0f1720;padding-top:4px}
  footer{margin-top:14px;border-top:1px solid #e3e8ec;padding-top:8px;font-size:10px;color:#66707a;text-align:center}
  @media print{body{margin:0;color:#000}.muted{color:#222}.card,table,td,th,footer,.brand,.nofiscal,.firma{border-color:#000}.brand b,.tag{color:#000}.tag{border-color:#000}}
`
}

// Leyenda de los documentos no fiscales: tiene que verse, no esconderse en el
// pie. El nombre completo del documento va en el encabezado.
const avisoNoFiscal = () => '<div class="nofiscal">Documento no fiscal · No válido como factura</div>'
const firmas = (...titulos) => `<div class="firmas">${titulos.map(titulo => `<div class="firma">${escapeHtml(titulo)}</div>`).join('')}</div>`


const header = (title, when, logo = '') => `<div class="brand">${logo ? `<img class="logo" src="${logo}" alt="">` : `<b>${escapeHtml(APP_NAME)}</b>`}<span>${escapeHtml(title)}</span></div><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(when)}</p>`
const footer = () => `<footer>Conservá este comprobante para cambios y garantía. Documento generado por ${escapeHtml(APP_NAME)}.</footer>`

// Niveles de comprobante y formatos físicos, independientes entre sí.
export const NIVELES_COMPROBANTE = [['rapido', 'Rápido'], ['completo', 'Completo'], ['detallado', 'Detallado']]
export const FORMATOS_COMPROBANTE = [['a4', 'A4'], ['thermal-80', '80 mm'], ['thermal-58', '58 mm']]
// La página del pedido usa A4 u 80 mm; el rollo de 58 mm no se imprime desde acá.
export const FORMATOS_PEDIDO = [['a4', 'A4'], ['thermal-80', '80 mm']]
const PREF_NIVEL = 'mobos:comprobante:nivel'
const PREF_FORMATO = 'mobos:comprobante:formato'
export const nivelPreferido = () => (typeof localStorage !== 'undefined' && localStorage.getItem(PREF_NIVEL)) || 'completo'
export const formatoPreferido = () => (typeof localStorage !== 'undefined' && localStorage.getItem(PREF_FORMATO)) || 'a4'
// Formato térmico configurado (80 mm por defecto: es la impresora habitual).
export const formatoTermicoPreferido = () => {
  const preferido = formatoPreferido()
  return preferido.startsWith('thermal') ? preferido : 'thermal-80'
}
export const recordarPreferencia = (nivel, formato) => {
  try { localStorage.setItem(PREF_NIVEL, nivel); localStorage.setItem(PREF_FORMATO, formato) } catch { /* sin almacenamiento */ }
}

// Cada comprobante imprime el QR de su propio nivel: el token autoriza esa
// vista. Es el token de impresión (impreso=true), que el panel no lista ni
// revoca al regenerar enlaces: el papel sigue funcionando.
export async function tokenDeNivel(orderId, level) {
  if (!orderId) return ''
  try {
    const data = await api.post(`/api/orders/${encodeURIComponent(orderId)}/access-tokens`, { level, impreso: true })
    return data?.token || ''
  } catch { return '' }
}

export async function buildOrderReceiptHtml(ordenViva, { level = 'completo', format = 'a4', token = '' } = {}) {
  // Comprobante congelado al emitir: si la venta lo tiene, se imprime lo que
  // quedó guardado y no los datos vivos (producto, cliente o empresa editados).
  const congelado = ordenViva?.receiptSnapshot?.datos
  const order = congelado && typeof congelado === 'object' ? { ...ordenViva, ...congelado } : ordenViva
  const items = Array.isArray(order.items) ? order.items : []
  const payments = Array.isArray(order.payments) ? order.payments : order.pagos || []
  const pagosConfirmados = payments.filter(payment => payment.status === 'CONFIRMED' || payment.status === undefined)
  const paid = pagosConfirmados.reduce((sum, payment) => sum + Number(payment.amountPyg ?? payment.monto ?? 0), 0)
  const when = order.createdAt || order.creadoEn || order.fecha
  const link = token ? accessUrlFor(token) : trackingUrlFor(order)
  let qr = ''
  try { if (link) qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'H', margin: 2, width: 320 }) } catch { /* el enlace queda impreso igual */ }
  const total = Number(order.totalPyg ?? order.total ?? 0)
  const pendiente = Math.max(0, total - Number(paid || order.totalPagado || 0))
  const itemsCount = items.reduce((suma, item) => suma + Number(item.quantity || 1), 0)
  const empresa = order.tenant?.name || order.empresaNombre || ''
  const sucursal = order.branch || null
  const cliente = order.customer || null
  const completo = level !== 'rapido'
  const detallado = level === 'detallado'

  const documento = order.billingName ? `<div class="card"><div class="label">Factura a</div><div>${escapeHtml(order.billingName)}${order.billingDocument ? ` · RUC ${escapeHtml(order.billingDocument)}` : ''}</div></div>` : ''
  const itemsRows = items.map(item => {
    const { ahorro } = ahorroDeLinea(item)
    return `<tr><td>${escapeHtml(item.description || item.nombre || 'Producto')}${ahorro > 0 ? `<br><span class="muted">descuento − ${escapeHtml(gs(ahorro))}</span>` : ''}</td><td class="num">${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? item.precio ?? 0))}</td><td class="num">${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? item.precio ?? 0)))}</td></tr>`
  }).join('')
  const contactoCliente = completo && cliente
    ? `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente.name || order.cliente || 'Consumidor final')}</strong>${cliente.document ? ` · ${escapeHtml(cliente.document)}` : ''}${cliente.phone ? `<br>${escapeHtml(cliente.countryCode || '')} ${escapeHtml(cliente.phone)}` : ''}${cliente.email ? `<br>${escapeHtml(cliente.email)}` : ''}${(cliente.addresses || []).map(address => `<br>${escapeHtml([address.address, address.city, address.department, address.country].filter(Boolean).join(', '))}`).join('')}</div></div>`
    : `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente?.name || order.cliente || 'Consumidor final')}</strong></div></div>`
  const empresaTenant = order.tenant || null
  const empresaDireccion = [empresaTenant?.address, empresaTenant?.city, empresaTenant?.department].filter(Boolean).join(', ')
  const empresaCard = completo
    ? `<div class="card"><div class="label">Empresa</div><div>${escapeHtml(empresa || APP_NAME)}${empresaTenant?.ruc ? ` · RUC ${escapeHtml(empresaTenant.ruc)}` : ''}${empresaDireccion ? `<br>${escapeHtml(empresaDireccion)}` : ''}${empresaTenant?.phone ? `<br>${escapeHtml(empresaTenant.phone)}` : ''}${sucursal?.name || sucursal?.address || sucursal?.city ? `<br>${escapeHtml([sucursal?.name, sucursal?.address, sucursal?.city, sucursal?.department].filter(Boolean).join(' · '))}` : ''}${sucursal?.phone ? `<br>${escapeHtml(sucursal.phone)}` : ''}${order.seller?.name ? `<br>Vendedor: ${escapeHtml(order.seller.name)}` : ''}</div></div>`
    : ''
  const pagosRows = pagosConfirmados.length
    ? `<div class="card"><div class="label">Pagos</div><table class="totals">${pagosConfirmados.map(payment => `<tr><td>${escapeHtml(ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago')}${completo && (payment.reference || payment.cuenta || payment.accountSnapshot?.name) ? ` · ${escapeHtml(payment.reference || payment.cuenta || payment.accountSnapshot.name)}` : ''}${detallado && (payment.paidAt || payment.createdAt) ? `<br><span class="muted">${escapeHtml(new Date(payment.paidAt || payment.createdAt).toLocaleString('es-PY'))}</span>` : ''}</td><td class="num">${escapeHtml(gs(payment.amountPyg ?? payment.monto ?? 0))}</td></tr>`).join('')}</table></div>`
    : ''
  const credito = completo && Number(order.creditDays || 0) > 0
    ? `<p><span class="tag">A crédito · ${escapeHtml(String(order.creditDays))} días${order.dueAt ? ` · vence ${escapeHtml(new Date(order.dueAt).toLocaleDateString('es-PY'))}` : ''}</span></p>`
    : ''
  const cronologia = detallado && Array.isArray(order.timeline) && order.timeline.length
    ? `<div class="card"><div class="label">Cronología</div><table class="totals">${order.timeline.map(evento => `<tr><td>${escapeHtml(evento.type === 'created' ? 'Pedido creado' : evento.type === 'payment' ? `Pago ${gs(evento.amountPyg || 0)}${evento.methodLabel ? ` · ${evento.methodLabel}` : ''}` : `Entrega: ${FULFILLMENT[evento.metadata?.current] || evento.metadata?.current || 'actualizada'}`)}</td><td class="num">${escapeHtml(new Date(evento.at).toLocaleString('es-PY'))}</td></tr>`).join('')}</table></div>`
    : ''
  const entregaNotas = completo && (order.deliveryType || order.deliveryNotes)
    ? `<p class="muted">Entrega: ${escapeHtml(order.deliveryType || '—')}${order.deliveryNotes ? ` · ${escapeHtml(order.deliveryNotes)}` : ''}</p>`
    : ''
  const logo = await getLogoDataUrl()

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Comprobante de compra', `${order.orderNumber || order.codigo || 'Pedido'} · ${when ? new Date(when).toLocaleString('es-PY') : ''}`, logo)}
    ${empresaCard}
    ${contactoCliente}
    ${documento}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(order.subtotalPyg ?? total))}</td></tr>
      ${Number(order.discountPyg || order.descuento || 0) ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(order.discountPyg || order.descuento))}</td></tr>` : ''}
      ${Number(order.deliveryPyg || order.montoDelivery || 0) ? `<tr><td>Entrega</td><td class="num">${escapeHtml(gs(order.deliveryPyg || order.montoDelivery))}</td></tr>` : ''}
      <tr><td>Total de ítems</td><td class="num">${escapeHtml(String(itemsCount))}</td></tr>
      <tr><td>Total</td><td class="num">${escapeHtml(gs(total))}</td></tr>
      <tr><td>Pagado</td><td class="num">${escapeHtml(gs(paid || order.totalPagado || 0))}</td></tr>
      ${pendiente > 0 ? `<tr class="saldo"><td>Saldo pendiente</td><td class="num">${escapeHtml(gs(pendiente))}</td></tr>` : ''}
    </table>
    ${pagosRows}
    ${credito}
    ${entregaNotas}
    <p><span class="tag">${escapeHtml(FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || order.deliveryType || order.entrega || 'En preparación')}</span></p>
    ${cronologia}
    ${link ? `${qr ? `<img class="qr" src="${qr}" alt="QR del comprobante">` : ''}<p class="small">${level === 'rapido' ? 'Seguimiento' : level === 'completo' ? 'Comprobante y seguimiento' : 'Comprobante detallado'}: ${escapeHtml(link)}</p>` : ''}
    <footer>Documento no fiscal. Conservá este comprobante para cambios y garantía. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printOrderReceipt(order, options = {}) {
  const html = await buildOrderReceiptHtml(order, options)
  return printHtml(html)
}

// Recibo de un pago individual (parcial o total): sirve para entregar al
// cliente al cobrar una parte del pedido, sin repetir el comprobante completo.
export async function printPaymentReceipt(payment, order, { format = 'a4' } = {}) {
  const monto = payment.amountPyg ?? payment.monto ?? 0
  const metodo = ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago'
  const referencia = payment.cuenta || payment.reference || payment.accountSnapshot?.name || ''
  const fecha = payment.fecha || payment.paidAt || payment.createdAt || new Date().toISOString()
  const logo = await getLogoDataUrl()
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo de pago</title><style>${styles(format)}</style></head><body>
    ${header('Recibo de pago', `${order?.orderNumber || order?.codigo || 'Pedido'} · ${new Date(fecha).toLocaleString('es-PY')}`, logo)}
    <div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(order?.customer?.name || order?.cliente || 'Consumidor final')}</strong></div></div>
    <table class="totals">
      <tr><td>Método</td><td class="num">${escapeHtml(metodo)}</td></tr>
      ${referencia ? `<tr><td>Cuenta / referencia</td><td class="num">${escapeHtml(referencia)}</td></tr>` : ''}
      ${payment.settlesAt ? `<tr><td>Acredita</td><td class="num">${escapeHtml(new Date(payment.settlesAt).toLocaleDateString('es-PY'))}</td></tr>` : ''}
      <tr><td>Monto cobrado</td><td class="num">${escapeHtml(gs(monto))}</td></tr>
    </table>
    <p class="muted">Este recibo corresponde a un pago parcial o total del pedido.</p>
    ${footer()}
  </body></html>`
  return printHtml(html)
}

const QUOTE_STATUS = { DRAFT: 'Borrador', SENT: 'Enviada', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CONVERTED: 'Convertida', EXPIRED: 'Vencida', CANCELLED: 'Cancelada' }

// Cotización para el cliente: ítems, descuento, total, validez y estado, con
// el QR/enlace para aceptar o rechazar desde el mismo comprobante.
export async function printQuoteReceipt(quote, { format = 'a4', token = '' } = {}) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const enlace = quoteUrlFor(token || quote.publicToken)
  let qr = ''
  try { if (enlace) qr = await QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 1, width: 200 }) } catch { /* el enlace queda impreso igual */ }
  const logo = await getLogoDataUrl()
  const empresa = quote.tenant?.name || quote.companyName || ''
  const sucursal = quote.branch || null
  const itemsRows = items.map(item => `<tr><td>${escapeHtml(item.description || 'Producto')}</td><td class="num">${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? 0))}</td><td class="num">${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? 0)))}</td></tr>`).join('')
  const validez = quote.validUntil ? `Válida hasta el ${new Date(quote.validUntil).toLocaleDateString('es-PY')}` : 'Sin vencimiento'
  const empresaCard = `<div class="card"><div class="label">Empresa</div><div>${escapeHtml(empresa || APP_NAME)}${sucursal?.name ? ` · ${escapeHtml(sucursal.name)}` : ''}${sucursal?.address || sucursal?.city ? `<br>${escapeHtml([sucursal.address, sucursal.city, sucursal.department].filter(Boolean).join(', '))}` : ''}${sucursal?.phone ? `<br>${escapeHtml(sucursal.phone)}` : ''}${quote.seller?.name ? `<br>Vendedor: ${escapeHtml(quote.seller.name)}` : ''}</div></div>`
  const cliente = quote.customer?.name || quote.customerName || 'Consumidor final'
  const contactoCliente = `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente)}</strong>${quote.customer?.document ? ` · ${escapeHtml(quote.customer.document)}` : ''}${quote.customer?.phone ? `<br>${escapeHtml(quote.customer.countryCode || '')} ${escapeHtml(quote.customer.phone)}` : ''}</div></div>`
  const descuento = Number(quote.discountPyg || 0)
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cotización ${escapeHtml(quote.number || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Cotización', `${quote.number || 'Cotización'} · ${quote.createdAt ? new Date(quote.createdAt).toLocaleString('es-PY') : ''}`, logo)}
    ${empresaCard}
    ${contactoCliente}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(quote.subtotalPyg ?? quote.totalPyg))}</td></tr>
      ${descuento ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(descuento))}</td></tr>` : ''}
      <tr><td>Total</td><td class="num">${escapeHtml(gs(quote.totalPyg))}</td></tr>
      <tr><td>Validez</td><td class="num">${escapeHtml(validez)}</td></tr>
    </table>
    <p><span class="tag">${escapeHtml(QUOTE_STATUS[quote.status] || quote.status || '')}</span></p>
    ${quote.notes ? `<p class="muted">${escapeHtml(quote.notes)}</p>` : ''}
    ${enlace ? `${qr ? `<img class="qr" src="${qr}" alt="QR de la cotización">` : ''}<p class="small">Aceptá o rechazá esta cotización: ${escapeHtml(enlace)}</p>` : ''}
    <footer>Documento no fiscal. Cotización generada por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
  return printHtml(html)
}

// Comprobante de reserva: entrega al cliente el IMEI apartado, la sucursal y
// el vencimiento para retirar o liberar.
export async function printReservationReceipt(reservation, { format = 'a4' } = {}) {
  const logo = await getLogoDataUrl()
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reserva</title><style>${styles(format)}</style></head><body>
    ${header('Comprobante de reserva', reservation.reservedUntil ? `Vence ${new Date(reservation.reservedUntil).toLocaleString('es-PY')}` : '', logo)}
    <div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(reservation.reservationCustomer || reservation.customerName || '—')}</strong></div></div>
    <table class="totals">
      <tr><td>Producto</td><td class="num">${escapeHtml(reservation.product?.name || reservation.productName || '—')}</td></tr>
      <tr><td>IMEI / serial</td><td class="num">${escapeHtml(reservation.serial || '—')}</td></tr>
      ${reservation.branch?.name ? `<tr><td>Sucursal</td><td class="num">${escapeHtml(reservation.branch.name)}</td></tr>` : ''}
      <tr><td>Vence</td><td class="num">${escapeHtml(reservation.reservedUntil ? new Date(reservation.reservedUntil).toLocaleString('es-PY') : '—')}</td></tr>
    </table>
    <p class="muted">La unidad queda apartada hasta la fecha indicada. Pasado el vencimiento se libera automáticamente.</p>
    ${footer()}
  </body></html>`
  return printHtml(html)
}

// Nota de entrega: respalda la entrega física de la mercadería con el receptor
// y su firma. Lista cantidades, no precios (el comprobante ya los detalla).
export async function buildDeliveryNoteHtml(order, { format = 'a4' } = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  const when = order.createdAt || order.creadoEn || order.fecha
  const empresa = order.tenant?.name || order.empresaNombre || ''
  const sucursal = order.branch || null
  const cliente = order.customer || null
  const logo = await getLogoDataUrl()
  const unidades = items.reduce((suma, item) => suma + Number(item.quantity || 1), 0)
  const itemsRows = items.map(item => `<tr><td>${escapeHtml(item.description || item.nombre || 'Producto')}</td><td class="num">${escapeHtml(item.quantity || 1)}</td></tr>`).join('')
  const empresaCard = `<div class="card"><div class="label">Entrega</div><div>${escapeHtml(empresa || APP_NAME)}${sucursal?.name ? ` · ${escapeHtml(sucursal.name)}` : ''}${sucursal?.address || sucursal?.city ? `<br>${escapeHtml([sucursal.address, sucursal.city, sucursal.department].filter(Boolean).join(', '))}` : ''}${order.seller?.name ? `<br>Vendedor: ${escapeHtml(order.seller.name)}` : ''}</div></div>`
  const direccion = order.deliveryAddress ? [order.deliveryAddress.address, order.deliveryAddress.city, order.deliveryAddress.department].filter(Boolean).join(', ') : (cliente?.addresses?.[0] ? [cliente.addresses[0].address, cliente.addresses[0].city, cliente.addresses[0].department].filter(Boolean).join(', ') : '')
  const clienteCard = `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente?.name || order.cliente || 'Consumidor final')}</strong>${cliente?.document ? ` · ${escapeHtml(cliente.document)}` : ''}${cliente?.phone ? `<br>${escapeHtml(`${cliente.countryCode || ''} ${cliente.phone}`.trim())}` : ''}${direccion ? `<br>${escapeHtml(direccion)}` : ''}</div></div>`
  const entregaNotas = order.deliveryType || order.deliveryNotes ? `<p class="muted">Entrega: ${escapeHtml(order.deliveryType || '—')}${order.deliveryNotes ? ` · ${escapeHtml(order.deliveryNotes)}` : ''}</p>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nota de entrega ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Nota de entrega', `${order.orderNumber || order.codigo || 'Pedido'} · ${when ? new Date(when).toLocaleString('es-PY') : ''}`, logo)}
    ${avisoNoFiscal()}
    ${empresaCard}
    ${clienteCard}
    <table><thead><tr><th>Producto</th><th class="num">Cantidad</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals"><tr><td>Total de unidades</td><td class="num">${escapeHtml(String(unidades))}</td></tr></table>
    ${entregaNotas}
    <p class="muted">Recibí conforme la mercadería detallada en este documento.</p>
    ${firmas('Nombre del receptor', 'Documento', 'Firma', 'Fecha')}
    <footer>Documento no fiscal. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printDeliveryNote(order, options = {}) {
  const html = await buildDeliveryNoteHtml(order, options)
  return printHtml(html)
}

// Remisión interna: traslado entre sucursales con la firma de quien despacha y
// quien recibe. El remito ya lista los IMEI; acá se firma la entrega.
export async function buildRemisionHtml(transfer, { format = 'a4' } = {}) {
  const lines = Array.isArray(transfer.lines) ? transfer.lines : []
  const lineas = lines.map((line) => {
    const seriales = Array.isArray(line.serials) ? line.serials : []
    return `<div class="item"><strong>${escapeHtml(line.sourceProduct?.name || 'Producto')} × ${escapeHtml(line.quantity || 1)}</strong>${seriales.length ? `<div class="serials">${seriales.map((serial) => escapeHtml(serial)).join('<br>')}</div>` : ''}</div>`
  }).join('')
  const logo = await getLogoDataUrl()
  const empresa = transfer.tenant?.name || ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remisión interna</title><style>${styles(format)}
    .items{margin:10px 0;border-top:1px dashed #d5dbe0}.item{padding:8px 0;border-bottom:1px dashed #d5dbe0}.serials{font-size:9px;line-height:1.5;color:#333;margin-top:4px}
    @media print{.items,.item{border-color:#000}}
  </style></head><body>
    ${header('Remisión interna', `${transfer.sourceBranch?.name || 'Origen'} → ${transfer.destinationBranch?.name || 'Destino'} · ${transfer.createdAt ? new Date(transfer.createdAt).toLocaleString('es-PY') : ''}`, logo)}
    ${avisoNoFiscal()}
    <div class="card"><div class="label">Datos</div><div>${escapeHtml(empresa || APP_NAME)}${transfer.createdBy?.name ? `<br>Despachado por: ${escapeHtml(transfer.createdBy.name)}` : ''}${transfer.destinationLocation?.name ? `<br>Destino en depósito: ${escapeHtml(transfer.destinationLocation.name)}` : ''}${transfer.aexGuide ? `<br>Guía AEX: ${escapeHtml(transfer.aexGuide)}` : ''}</div></div>
    <div class="items">${lineas}</div>
    ${transfer.notes ? `<p class="muted">${escapeHtml(transfer.notes)}</p>` : ''}
    <p class="muted">Controlá el contenido contra esta remisión al recibir.</p>
    ${firmas('Despachado por (firma)', 'Recibido por (firma)', 'Aclaración', 'Fecha')}
    <footer>Documento no fiscal. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printRemisionReceipt(transfer, options = {}) {
  const html = await buildRemisionHtml(transfer, options)
  return printHtml(html)
}

// Recibo interno de un cobro puntual: monto, medio y referencia, con firmas.
export async function buildInternalReceiptHtml(payment = {}, order = {}, { format = 'a4' } = {}) {
  const monto = payment.amountPyg ?? payment.monto ?? 0
  const metodo = ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago'
  const referencia = payment.cuenta || payment.reference || payment.accountSnapshot?.name || ''
  const when = payment.fecha || payment.paidAt || payment.createdAt || new Date().toISOString()
  const pedido = order?.orderNumber || order?.codigo || 'Pedido'
  const numero = payment.receiptNumber || payment.number || `${pedido}-${String(payment.id || '').slice(-4).toUpperCase() || 'R'}`
  const logo = await getLogoDataUrl()
  const empresa = order?.tenant?.name || order?.empresaNombre || ''
  const cliente = order?.customer?.name || order?.cliente || 'Consumidor final'
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo interno ${escapeHtml(numero)}</title><style>${styles(format)}</style></head><body>
    ${header('Recibo interno', `N.º ${numero} · ${new Date(when).toLocaleString('es-PY')}`, logo)}
    ${avisoNoFiscal()}
    <div class="card"><div class="label">Recibí de</div><div><strong>${escapeHtml(cliente)}</strong><br>Concepto: cobro del pedido ${escapeHtml(pedido)}</div></div>
    <table class="totals">
      <tr><td>Medio</td><td class="num">${escapeHtml(metodo)}</td></tr>
      ${referencia ? `<tr><td>Cuenta / referencia</td><td class="num">${escapeHtml(referencia)}</td></tr>` : ''}
      ${payment.settlesAt ? `<tr><td>Acredita</td><td class="num">${escapeHtml(new Date(payment.settlesAt).toLocaleDateString('es-PY'))}</td></tr>` : ''}
      <tr><td>Monto cobrado</td><td class="num">${escapeHtml(gs(monto))}</td></tr>
    </table>
    ${firmas('Firma de quien recibe', 'Firma de quien entrega')}
    <footer>Documento no fiscal. Generado por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printInternalReceipt(payment, order, options = {}) {
  const html = await buildInternalReceiptHtml(payment, order, options)
  return printHtml(html)
}

// Proforma / presupuesto de una cotización: ítems, descuento, total y validez,
// sin el QR de aceptación (es un presupuesto impreso, no un enlace vivo).
export async function buildProformaHtml(quote, { format = 'a4' } = {}) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const logo = await getLogoDataUrl()
  const empresa = quote.tenant?.name || quote.companyName || ''
  const sucursal = quote.branch || null
  const cliente = quote.customer?.name || quote.customerName || 'Consumidor final'
  const itemsRows = items.map(item => `<tr><td>${escapeHtml(item.description || 'Producto')}</td><td class="num">${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? 0))}</td><td class="num">${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? 0)))}</td></tr>`).join('')
  const descuento = Number(quote.discountPyg || 0)
  const validez = quote.validUntil ? `Válida hasta el ${new Date(quote.validUntil).toLocaleDateString('es-PY')}` : 'Sin vencimiento'
  const empresaCard = `<div class="card"><div class="label">Empresa</div><div>${escapeHtml(empresa || APP_NAME)}${sucursal?.name ? ` · ${escapeHtml(sucursal.name)}` : ''}${quote.seller?.name ? `<br>Vendedor: ${escapeHtml(quote.seller.name)}` : ''}</div></div>`
  const clienteCard = `<div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(cliente)}</strong>${quote.customer?.document ? ` · ${escapeHtml(quote.customer.document)}` : ''}${quote.customer?.phone ? `<br>${escapeHtml(`${quote.customer.countryCode || ''} ${quote.customer.phone}`.trim())}` : ''}</div></div>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Proforma ${escapeHtml(quote.number || '')}</title><style>${styles(format)}</style></head><body>
    ${header('Factura proforma', `Presupuesto ${quote.number || ''} · ${quote.createdAt ? new Date(quote.createdAt).toLocaleString('es-PY') : ''}`, logo)}
    ${avisoNoFiscal()}
    ${empresaCard}
    ${clienteCard}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(quote.subtotalPyg ?? quote.totalPyg))}</td></tr>
      ${descuento ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(descuento))}</td></tr>` : ''}
      <tr><td>Total</td><td class="num">${escapeHtml(gs(quote.totalPyg))}</td></tr>
      <tr><td>Validez</td><td class="num">${escapeHtml(validez)}</td></tr>
    </table>
    ${quote.notes ? `<p class="muted">${escapeHtml(quote.notes)}</p>` : ''}
    <p class="muted">Presupuesto sin validez fiscal: no reemplaza a la factura.</p>
    <footer>Documento no fiscal. Proforma generada por ${escapeHtml(APP_NAME)}${empresa ? ` para ${escapeHtml(empresa)}` : ''}.</footer>
  </body></html>`
}

export async function printProformaReceipt(quote, options = {}) {
  const html = await buildProformaHtml(quote, options)
  return printHtml(html)
}
