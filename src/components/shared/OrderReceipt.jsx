import { gs } from '@/utils/calculos'
import QRCode from 'qrcode'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))

export const trackingUrlFor = (order) => {
  if (!order?.publicToken) return ''
  const apiOrigin = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  // Puede apuntarse a una página pública branded cuando exista; mientras, el
  // endpoint público ya entrega solo el estado seguro del pedido.
  const publicBase = String(import.meta.env.VITE_PUBLIC_TRACKING_URL || apiOrigin).replace(/\/$/, '')
  return publicBase ? `${publicBase}/api/orders/public/${encodeURIComponent(order.publicToken)}` : ''
}

export async function printOrderReceipt(order, { format = 'a4' } = {}) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720')
  if (!popup) return false
  const items = Array.isArray(order.items) ? order.items : []
  const payments = Array.isArray(order.payments) ? order.payments : order.pagos || []
  const paid = payments.filter(payment => payment.status === 'CONFIRMED' || payment.status === undefined).reduce((sum, payment) => sum + Number(payment.amountPyg ?? payment.monto ?? 0), 0)
  const when = order.createdAt || order.creadoEn || order.fecha
  const tracking = trackingUrlFor(order)
  let qr = ''
  try { if (tracking) qr = await QRCode.toDataURL(tracking, { errorCorrectionLevel: 'M', margin: 1, width: 180 }) } catch { /* El enlace sigue disponible aunque no pueda renderizarse el QR. */ }
  const thermal = format === 'thermal'
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(order.orderNumber || order.codigo || '')}</title><style>@page{size:${thermal ? '80mm auto' : 'A4'};margin:${thermal ? '4mm' : '16mm'}}body{font:${thermal ? '11px' : '13px'} system-ui,sans-serif;margin:0;color:#111;max-width:${thermal ? '72mm' : '760px'}}h1{font-size:${thermal ? '17px' : '22px'};margin:0 0 4px}.muted{color:#555}.row{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.items{margin:18px 0;border-top:1px dashed #999}.item{padding:9px 0;border-bottom:1px dashed #999}.total{font-size:${thermal ? '15px' : '18px'};font-weight:700}.small{font-size:10px;word-break:break-all}.qr{display:block;width:${thermal ? '42mm' : '46mm'};height:${thermal ? '42mm' : '46mm'};margin:12px auto 4px}@media print{body{margin:0}}</style></head><body><h1>Comprobante de compra</h1><p class="muted">${escapeHtml(order.orderNumber || order.codigo || 'Pedido')} · ${escapeHtml(when ? new Date(when).toLocaleString('es-PY') : '')}</p><p><strong>Cliente:</strong> ${escapeHtml(order.customer?.name || order.cliente || 'Consumidor final')}</p><div class="items">${items.map(item => `<div class="item"><strong>${escapeHtml(item.description || item.nombre || 'Producto')}</strong><div class="row"><span>${escapeHtml(item.quantity || 1)} × ${escapeHtml(gs(item.unitPricePyg ?? item.precio ?? 0))}</span><span>${escapeHtml(gs(item.totalPyg ?? (item.quantity || 1) * (item.unitPricePyg ?? item.precio ?? 0)))}</span></div></div>`).join('')}</div><div class="row"><span>Subtotal</span><span>${escapeHtml(gs(order.subtotalPyg ?? order.subtotal ?? order.totalPyg ?? order.total ?? 0))}</span></div>${Number(order.discountPyg || order.descuento || 0) ? `<div class="row"><span>Descuento</span><span>− ${escapeHtml(gs(order.discountPyg || order.descuento))}</span></div>` : ''}${Number(order.deliveryPyg || order.montoDelivery || 0) ? `<div class="row"><span>Entrega</span><span>${escapeHtml(gs(order.deliveryPyg || order.montoDelivery))}</span></div>` : ''}<div class="row total"><span>Total</span><span>${escapeHtml(gs(order.totalPyg ?? order.total ?? 0))}</span></div><div class="row"><span>Pagado</span><span>${escapeHtml(gs(paid || order.totalPagado || 0))}</span></div><p class="muted">Entrega: ${escapeHtml(order.fulfillmentStatus || order.deliveryType || order.entrega || 'En preparación')}</p>${tracking ? `${qr ? `<img class="qr" src="${qr}" alt="QR de seguimiento">` : ''}<p class="small">Seguimiento: ${escapeHtml(tracking)}</p>` : ''}<script>window.onload=()=>window.print()<\/script></body></html>`)
  popup.document.close()
  return true
}

// Recibo de un pago individual (parcial o total): sirve para entregar al
// cliente al cobrar una parte del pedido, sin repetir el comprobante completo.
export async function printPaymentReceipt(payment, order, { format = 'a4' } = {}) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720')
  if (!popup) return false
  const thermal = format === 'thermal'
  const monto = payment.amountPyg ?? payment.monto ?? 0
  const metodo = payment.medioPago || payment.method || 'Pago'
  const referencia = payment.cuenta || payment.reference || payment.accountSnapshot?.name || ''
  const fecha = payment.fecha || payment.paidAt || payment.createdAt || new Date().toISOString()
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo de pago</title><style>@page{size:${thermal ? '80mm auto' : 'A4'};margin:${thermal ? '4mm' : '16mm'}}body{font:${thermal ? '11px' : '13px'} system-ui,sans-serif;margin:0;color:#111;max-width:${thermal ? '72mm' : '760px'}}h1{font-size:${thermal ? '17px' : '22px'};margin:0 0 4px}.muted{color:#555}.row{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.total{font-size:${thermal ? '15px' : '18px'};font-weight:700}@media print{body{margin:0}}</style></head><body><h1>Recibo de pago</h1><p class="muted">${escapeHtml(order?.orderNumber || order?.codigo || 'Pedido')} · ${escapeHtml(new Date(fecha).toLocaleString('es-PY'))}</p><p><strong>Cliente:</strong> ${escapeHtml(order?.customer?.name || order?.cliente || 'Consumidor final')}</p><div class="row"><span>Método</span><span>${escapeHtml(metodo)}</span></div>${referencia ? `<div class="row"><span>Cuenta / referencia</span><span>${escapeHtml(referencia)}</span></div>` : ''}<div class="row total"><span>Monto cobrado</span><span>${escapeHtml(gs(monto))}</span></div><p class="muted">Este recibo corresponde a un pago parcial o total del pedido.</p><script>window.onload=()=>window.print()<\/script></body></html>`)
  popup.document.close()
  return true
}

// Comprobante de reserva: entrega al cliente el IMEI apartado, la sucursal y
// el vencimiento para retirar o liberar.
export async function printReservationReceipt(reservation, { format = 'a4' } = {}) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720')
  if (!popup) return false
  const thermal = format === 'thermal'
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reserva</title><style>@page{size:${thermal ? '80mm auto' : 'A4'};margin:${thermal ? '4mm' : '16mm'}}body{font:${thermal ? '11px' : '13px'} system-ui,sans-serif;margin:0;color:#111;max-width:${thermal ? '72mm' : '760px'}}h1{font-size:${thermal ? '17px' : '22px'};margin:0 0 4px}.muted{color:#555}.row{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.total{font-size:${thermal ? '15px' : '18px'};font-weight:700}@media print{body{margin:0}}</style></head><body><h1>Comprobante de reserva</h1><p><strong>Cliente:</strong> ${escapeHtml(reservation.reservationCustomer || reservation.customerName || '—')}</p><div class="row"><span>Producto</span><span>${escapeHtml(reservation.product?.name || reservation.productName || '—')}</span></div><div class="row"><span>IMEI / serial</span><span>${escapeHtml(reservation.serial || '—')}</span></div>${reservation.branch?.name ? `<div class="row"><span>Sucursal</span><span>${escapeHtml(reservation.branch.name)}</span></div>` : ''}<div class="row total"><span>Vence</span><span>${escapeHtml(reservation.reservedUntil ? new Date(reservation.reservedUntil).toLocaleString('es-PY') : '—')}</span></div><p class="muted">La unidad queda apartada hasta la fecha indicada. Pasado el vencimiento se libera automáticamente.</p><script>window.onload=()=>window.print()<\/script></body></html>`)
  popup.document.close()
  return true
}
