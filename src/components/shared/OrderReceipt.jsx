import { gs } from '@/utils/calculos'
import { printHtml } from '@/utils/printHtml'
import { APP_NAME } from '@/lib/brand'
import QRCode from 'qrcode'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))

export const trackingUrlFor = (order) => {
  if (!order?.publicToken) return ''
  const configured = String(import.meta.env.VITE_PUBLIC_TRACKING_URL || '').replace(/\/$/, '')
  // El QR del comprobante abre la página pública del pedido (estado + garantías).
  const base = configured || (typeof window !== 'undefined' ? window.location.origin : '')
  return base ? `${base}/pedido/${encodeURIComponent(order.publicToken)}` : ''
}

const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }

// Hoja de estilos común para los tres comprobantes (A4 y térmico 80 mm).
const styles = (thermal) => `
  @page{size:${thermal ? '80mm auto' : 'A4'};margin:${thermal ? '5mm' : '16mm'}}
  *{box-sizing:border-box}
  body{font:${thermal ? '11px/1.5' : '13px/1.6'} ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;color:#0f1720;max-width:${thermal ? '72mm' : '760px'}}
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
  .qr{display:block;width:${thermal ? '40mm' : '42mm'};height:${thermal ? '40mm' : '42mm'};margin:10px auto 6px}
  .small{font-size:10px;word-break:break-all;text-align:center}
  footer{margin-top:14px;border-top:1px solid #e3e8ec;padding-top:8px;font-size:10px;color:#66707a;text-align:center}
  @media print{body{margin:0}}
`

const header = (title, when) => `<div class="brand"><b>${escapeHtml(APP_NAME)}</b><span>${escapeHtml(title)}</span></div><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(when)}</p>`
const footer = () => `<footer>Conservá este comprobante para cambios y garantía. Documento generado por ${escapeHtml(APP_NAME)}.</footer>`

export async function printOrderReceipt(order, { format = 'a4' } = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  const payments = Array.isArray(order.payments) ? order.payments : order.pagos || []
  const paid = payments.filter(payment => payment.status === 'CONFIRMED' || payment.status === undefined).reduce((sum, payment) => sum + Number(payment.amountPyg ?? payment.monto ?? 0), 0)
  const when = order.createdAt || order.creadoEn || order.fecha
  const tracking = trackingUrlFor(order)
  let qr = ''
  try { if (tracking) qr = await QRCode.toDataURL(tracking, { errorCorrectionLevel: 'M', margin: 1, width: 200 }) } catch { /* El enlace sigue disponible aunque no pueda renderizarse el QR. */ }
  const thermal = format === 'thermal'
  const total = Number(order.totalPyg ?? order.total ?? 0)
  const documento = order.billingName ? `<div class="card"><div class="label">Factura a</div><div>${escapeHtml(order.billingName)}${order.billingDocument ? ` · RUC ${escapeHtml(order.billingDocument)}` : ''}</div></div>` : ''
  const itemsRows = items.map(item => `<tr><td>${escapeHtml(item.description || item.nombre || 'Producto')}${Number(item.discountPyg || 0) > 0 ? `<br><span class="muted">descuento − ${escapeHtml(gs(item.discountPyg))}</span>` : ''}</td><td class="num">${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? item.precio ?? 0))}</td><td class="num">${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? item.precio ?? 0)))}</td></tr>`).join('')
  const paymentsRows = payments.length ? `<div class="card"><div class="label">Pagos</div><table class="totals">${payments.map(payment => `<tr><td>${escapeHtml(ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago')}${payment.reference || payment.cuenta ? ` · ${escapeHtml(payment.reference || payment.cuenta)}` : ''}</td><td class="num">${escapeHtml(gs(payment.amountPyg ?? payment.monto ?? 0))}</td></tr>`).join('')}</table></div>` : ''
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>${styles(thermal)}</style></head><body>
    ${header('Comprobante de compra', `${order.orderNumber || order.codigo || 'Pedido'} · ${when ? new Date(when).toLocaleString('es-PY') : ''}`)}
    <div class="card"><div class="label">Cliente</div><div><strong>${escapeHtml(order.customer?.name || order.cliente || 'Consumidor final')}</strong>${order.customer?.phone ? ` · ${escapeHtml(order.customer.phone)}` : ''}</div></div>
    ${documento}
    <table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(gs(order.subtotalPyg ?? total))}</td></tr>
      ${Number(order.discountPyg || order.descuento || 0) ? `<tr><td>Descuento</td><td class="num">− ${escapeHtml(gs(order.discountPyg || order.descuento))}</td></tr>` : ''}
      ${Number(order.deliveryPyg || order.montoDelivery || 0) ? `<tr><td>Entrega</td><td class="num">${escapeHtml(gs(order.deliveryPyg || order.montoDelivery))}</td></tr>` : ''}
      <tr><td>Total</td><td class="num">${escapeHtml(gs(total))}</td></tr>
      <tr><td>Pagado</td><td class="num">${escapeHtml(gs(paid || order.totalPagado || 0))}</td></tr>
    </table>
    ${paymentsRows}
    <p><span class="tag">${escapeHtml(FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || order.deliveryType || order.entrega || 'En preparación')}</span></p>
    ${tracking ? `${qr ? `<img class="qr" src="${qr}" alt="QR de seguimiento">` : ''}<p class="small">Seguimiento y garantía: ${escapeHtml(tracking)}</p>` : ''}
    ${footer()}
  </body></html>`
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
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo de pago</title><style>${styles(thermal)}</style></head><body>
    ${header('Recibo de pago', `${order?.orderNumber || order?.codigo || 'Pedido'} · ${new Date(fecha).toLocaleString('es-PY')}`)}
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
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reserva</title><style>${styles(thermal)}</style></head><body>
    ${header('Comprobante de reserva', reservation.reservedUntil ? `Vence ${new Date(reservation.reservedUntil).toLocaleString('es-PY')}` : '')}
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
