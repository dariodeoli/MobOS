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

const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }

// Hoja de estilos común para los tres comprobantes (A4 y térmico 80 mm).
const styles = (thermal) => `
  @page{size:${thermal ? '58mm auto' : 'A4'};margin:${thermal ? '3mm' : '16mm'}}
  *{box-sizing:border-box}
  body{font:${thermal ? '10px/1.45' : '13px/1.6'} ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;color:#0f1720;max-width:${thermal ? '52mm' : '760px'}}
  .brand{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:2px solid #0c8876;padding-bottom:8px;margin-bottom:14px}
  .brand b{font-size:${thermal ? '12px' : '13px'};color:#0c8876;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
  .brand span{font-size:10px;color:#66707a;text-transform:uppercase;letter-spacing:.12em}
  h1{font-size:${thermal ? '15px' : '20px'};margin:0 0 2px;letter-spacing:-.01em}
  .muted{color:#66707a}
  .meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 12px;margin:6px 0 0}
  .card{border:1px solid #e3e8ec;border-radius:10px;padding:10px 12px;margin:10px 0}
  .card .label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#66707a;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#66707a;text-align:left;font-weight:600}
  td,th{padding:6px 0;border-bottom:1px dashed #d5dbe0;vertical-align:top}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .totals td{border:0;padding:3px 0}
  .totals tr:last-child td{font-weight:700;font-size:${thermal ? '14px' : '16px'};border-top:1px solid #0f1720;padding-top:6px}
  .tag{display:inline-block;border:1px solid #0c8876;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;color:#0c8876}
  .brand img.logo{display:block;height:${thermal ? '12mm' : '16mm'};max-width:${thermal ? '46mm' : '70mm'};object-fit:contain;margin:0 auto 4px}
  .qr{display:block;width:${thermal ? '32mm' : '42mm'};height:${thermal ? '32mm' : '42mm'};margin:10px auto 6px}
  .small{font-size:10px;word-break:break-all;text-align:center}
  footer{margin-top:14px;border-top:1px solid #e3e8ec;padding-top:8px;font-size:10px;color:#66707a;text-align:center}
  @media print{body{margin:0}}
`

const header = (title, when, logo = '') => `<div class="brand">${logo ? `<img class="logo" src="${logo}" alt="">` : `<b>${escapeHtml(APP_NAME)}</b>`}<span>${escapeHtml(title)}</span></div><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(when)}</p>`
const footer = () => `<footer>Conservá este comprobante para cambios y garantía. Documento generado por ${escapeHtml(APP_NAME)}.</footer>`

// Niveles de comprobante y formatos físicos, independientes entre sí.
export const NIVELES_COMPROBANTE = [['rapido', 'Rápido'], ['completo', 'Completo'], ['detallado', 'Detallado']]
export const FORMATOS_COMPROBANTE = [['a4', 'A4'], ['thermal', '58 mm']]
const PREF_NIVEL = 'mobos:comprobante:nivel'
const PREF_FORMATO = 'mobos:comprobante:formato'
export const nivelPreferido = () => (typeof localStorage !== 'undefined' && localStorage.getItem(PREF_NIVEL)) || 'completo'
export const formatoPreferido = () => (typeof localStorage !== 'undefined' && localStorage.getItem(PREF_FORMATO)) || 'a4'
export const recordarPreferencia = (nivel, formato) => {
  try { localStorage.setItem(PREF_NIVEL, nivel); localStorage.setItem(PREF_FORMATO, formato) } catch { /* sin almacenamiento */ }
}

// Cada comprobante imprime el QR de su propio nivel: el token autoriza esa vista.
export async function tokenDeNivel(orderId, level) {
  if (!orderId) return ''
  try {
    const data = await api.post(`/api/orders/${encodeURIComponent(orderId)}/access-tokens`, { level })
    return data?.token || ''
  } catch { return '' }
}

export async function buildOrderReceiptHtml(order, { level = 'completo', format = 'a4', token = '' } = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  const payments = Array.isArray(order.payments) ? order.payments : order.pagos || []
  const pagosConfirmados = payments.filter(payment => payment.status === 'CONFIRMED' || payment.status === undefined)
  const paid = pagosConfirmados.reduce((sum, payment) => sum + Number(payment.amountPyg ?? payment.monto ?? 0), 0)
  const when = order.createdAt || order.creadoEn || order.fecha
  const link = token ? accessUrlFor(token) : trackingUrlFor(order)
  let qr = ''
  try { if (link) qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 200 }) } catch { /* el enlace queda impreso igual */ }
  const thermal = format === 'thermal'
  const total = Number(order.totalPyg ?? order.total ?? 0)
  const pendiente = Math.max(0, total - Number(paid || order.totalPagado || 0))
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
  const empresaCard = completo
    ? `<div class="card"><div class="label">Empresa</div><div>${escapeHtml(empresa || APP_NAME)}${sucursal?.name ? ` · ${escapeHtml(sucursal.name)}` : ''}${sucursal?.address || sucursal?.city ? `<br>${escapeHtml([sucursal.address, sucursal.city, sucursal.department].filter(Boolean).join(', '))}` : ''}${sucursal?.phone ? `<br>${escapeHtml(sucursal.phone)}` : ''}${order.seller?.name ? `<br>Vendedor: ${escapeHtml(order.seller.name)}` : ''}</div></div>`
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

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>${styles(thermal)}</style></head><body>
    ${header('Comprobante de compra', `${order.orderNumber || order.codigo || 'Pedido'} · ${when ? new Date(when).toLocaleString('es-PY') : ''}`, logo)}
    ${empresaCard}
    ${contactoCliente}
    ${documento}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(order.subtotalPyg ?? total))}</td></tr>
      ${Number(order.discountPyg || order.descuento || 0) ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(order.discountPyg || order.descuento))}</td></tr>` : ''}
      ${Number(order.deliveryPyg || order.montoDelivery || 0) ? `<tr><td>Entrega</td><td class="num">${escapeHtml(gs(order.deliveryPyg || order.montoDelivery))}</td></tr>` : ''}
      <tr><td>Total</td><td class="num">${escapeHtml(gs(total))}</td></tr>
      <tr><td>Pagado</td><td class="num">${escapeHtml(gs(paid || order.totalPagado || 0))}</td></tr>
      ${pendiente > 0 ? `<tr><td>Saldo pendiente</td><td class="num">${escapeHtml(gs(pendiente))}</td></tr>` : ''}
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
  const thermal = format === 'thermal'
  const monto = payment.amountPyg ?? payment.monto ?? 0
  const metodo = ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago'
  const referencia = payment.cuenta || payment.reference || payment.accountSnapshot?.name || ''
  const fecha = payment.fecha || payment.paidAt || payment.createdAt || new Date().toISOString()
  const logo = await getLogoDataUrl()
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo de pago</title><style>${styles(thermal)}</style></head><body>
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

// Comprobante de reserva: entrega al cliente el IMEI apartado, la sucursal y
// el vencimiento para retirar o liberar.
export async function printReservationReceipt(reservation, { format = 'a4' } = {}) {
  const thermal = format === 'thermal'
  const logo = await getLogoDataUrl()
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reserva</title><style>${styles(thermal)}</style></head><body>
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
