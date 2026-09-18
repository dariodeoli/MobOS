// Tickets ESC/POS: mismo contenido que los comprobantes HTML, pero en comandos
// para la térmica (58/80 mm). El agente local solo transporta los bytes.
import { gs } from '@/utils/calculos'
import { APP_NAME } from '@/lib/brand'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { crearTicket } from './escpos'

const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }

const fecha = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '')

// Comprobante de compra. `link` es el enlace del nivel (se imprime como QR).
export function ticketComprobante(order, { nivel = 'completo', ancho = 80, link = '' } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const items = Array.isArray(order.items) ? order.items : []
  const payments = Array.isArray(order.payments) ? order.payments : order.pagos || []
  const pagos = payments.filter((pago) => pago.status === 'CONFIRMED' || pago.status === undefined)
  const pagado = pagos.reduce((suma, pago) => suma + Number(pago.amountPyg ?? pago.monto ?? 0), 0)
  const total = Number(order.totalPyg ?? order.total ?? 0)
  const pendiente = Math.max(0, total - Number(pagado || order.totalPagado || 0))
  const completo = nivel !== 'rapido'
  const detallado = nivel === 'detallado'
  const empresa = order.tenant?.name || order.empresaNombre || ''
  const sucursal = order.branch || null
  const cliente = order.customer || null

  t.centrado(empresa || APP_NAME).negrita().centrado('Comprobante de compra').negrita(false)
  t.centrado(`${order.orderNumber || order.codigo || 'Pedido'} · ${fecha(order.createdAt || order.creadoEn || order.fecha)}`)
  t.linea()

  if (completo && (empresa || sucursal)) {
    t.texto(empresa || APP_NAME)
    if (sucursal?.name) t.texto(sucursal.name)
    const direccion = [sucursal?.address, sucursal?.city, sucursal?.department].filter(Boolean).join(', ')
    if (direccion) t.texto(direccion)
    if (sucursal?.phone) t.texto(sucursal.phone)
    if (order.seller?.name) t.texto(`Vendedor: ${order.seller.name}`)
    t.linea()
  }

  t.par('Cliente', cliente?.name || order.cliente || 'Consumidor final')
  if (completo && cliente?.document) t.par('Documento', cliente.document)
  if (completo && cliente?.phone) t.par('Teléfono', `${cliente.countryCode || ''} ${cliente.phone}`.trim())
  if (completo && cliente?.email) t.texto(cliente.email)
  if (order.billingName) t.par('Factura a', `${order.billingName}${order.billingDocument ? ` · ${order.billingDocument}` : ''}`)
  t.linea()

  for (const item of items) {
    const cantidad = Number(item.quantity || 1)
    const unitario = Number(item.unitPricePyg ?? item.precio ?? 0)
    const lineaTotal = Number(item.totalPyg ?? cantidad * unitario)
    t.texto(item.description || item.nombre || 'Producto')
    t.par(`  ${cantidad} × ${gs(unitario)}`, gs(lineaTotal))
  }
  t.linea()

  t.par('Subtotal', gs(order.subtotalPyg ?? total))
  const descuento = Number(order.discountPyg || order.descuento || 0)
  if (descuento) t.par('Descuento', `- ${gs(descuento)}`)
  const entrega = Number(order.deliveryPyg || order.montoDelivery || 0)
  if (entrega) t.par('Entrega', gs(entrega))
  t.doble().par('TOTAL', gs(total)).doble(false)
  t.par('Pagado', gs(pagado || order.totalPagado || 0))
  if (pendiente > 0) t.par('Saldo pendiente', gs(pendiente))

  if (completo && pagos.length) {
    t.linea()
    t.texto('Pagos')
    for (const pago of pagos) {
      const metodo = ETIQUETAS_MEDIO_PAGO[pago.method] || pago.medioPago || 'Pago'
      const referencia = pago.reference || pago.cuenta || pago.accountSnapshot?.name || ''
      t.par(`${metodo}${referencia ? ` · ${referencia}` : ''}`, gs(pago.amountPyg ?? pago.monto ?? 0))
      if (detallado && (pago.paidAt || pago.createdAt)) t.texto(`  ${fecha(pago.paidAt || pago.createdAt)}`)
    }
  }

  if (completo && Number(order.creditDays || 0) > 0) {
    t.linea()
    t.texto(`A crédito · ${order.creditDays} días${order.dueAt ? ` · vence ${new Date(order.dueAt).toLocaleDateString('es-PY')}` : ''}`)
  }

  if (completo && (order.deliveryType || order.deliveryNotes)) {
    t.texto(`Entrega: ${order.deliveryType || '—'}${order.deliveryNotes ? ` · ${order.deliveryNotes}` : ''}`)
  }

  if (detallado && Array.isArray(order.timeline) && order.timeline.length) {
    t.linea()
    t.texto('Cronología')
    for (const evento of order.timeline) {
      const texto = evento.type === 'created'
        ? 'Pedido creado'
        : evento.type === 'payment'
          ? `Pago ${gs(evento.amountPyg || 0)}${evento.methodLabel ? ` · ${evento.methodLabel}` : ''}`
          : `Entrega: ${FULFILLMENT[evento.metadata?.current] || evento.metadata?.current || 'actualizada'}`
      t.par(texto, fecha(evento.at))
    }
  }

  t.linea()
  t.centrado(FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || order.deliveryType || order.entrega || 'En preparación')
  if (link) {
    t.avanza(1)
    t.centrado(nivel === 'rapido' ? 'Seguimiento' : 'Comprobante y seguimiento')
    t.qr(link, { tamano: 6 })
    t.texto(link)
  }
  t.linea()
  t.centrado(`Documento no fiscal. Conservá este comprobante para cambios y garantía. Generado por ${APP_NAME}${empresa ? ` para ${empresa}` : ''}.`)
  return t.avanza(2).corte()
}

// Una etiqueta de unidad dentro de un ticket ya abierto (sirve para una suelta
// o para un lote, sin duplicar el diseño).
function etiquetaUnidadEn(t, unit) {
  const serial = String(unit.serial || '')
  const condicion = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }[unit.condition] || unit.condition || ''
  t.centrado(`${APP_NAME} · ETIQUETA`)
  t.linea()
  t.negrita().texto(unit.product?.name || 'Producto').negrita(false)
  if (condicion) t.texto(condicion)
  if (unit.batteryHealth) t.texto(`Batería ${unit.batteryHealth}%`)
  if (unit.location?.name) t.texto(`Ubicación: ${unit.location.name}`)
  if (unit.supplierName) t.texto(`Proveedor: ${unit.supplierName}`)
  t.linea()
  if (serial) {
    t.centrado('IMEI / Serial')
    t.centrado(serial)
    t.avanza(1)
    t.qr(`MOBOS:${serial}`, { tamano: 7 })
    t.barcode(`MOBOS:${serial}`)
  }
  t.linea()
  t.centrado('Escaneá para buscar, vender o verificar esta unidad.')
  return t.avanza(2).corte()
}

// Etiqueta de una unidad de stock: producto, estado, IMEI y QR/código de barras.
export function ticketEtiquetaUnidad(unit, { ancho = 80 } = {}) {
  return etiquetaUnidadEn(crearTicket({ ancho }).iniciar(), unit)
}

// Etiqueta de precio/góndola con QR que abre el producto.
export function ticketEtiquetaPrecio(product, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const precio = Number(product.pricePyg ?? product.precioVenta ?? 0)
  const mayorista = Number(product.wholesalePricePyg ?? 0)
  t.centrado(`${APP_NAME} · ETIQUETA DE PRECIO`)
  t.linea()
  t.negrita().texto(product.name || '').negrita(false)
  if (product.sku) t.texto(product.sku)
  t.avanza(1)
  t.centrado(precio > 0 ? gs(precio) : '—')
  if (mayorista > 0) t.centrado(`Mayorista: ${gs(mayorista)}`)
  t.avanza(1)
  t.qr(`MOBOS:PROD:${product.sku || product.id || ''}`, { tamano: 6 })
  return t.avanza(2).corte()
}

// Remito de traslado entre sucursales, con los IMEI para control físico.
export function ticketRemito(transfer, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const lineas = Array.isArray(transfer.lines) ? transfer.lines : []
  t.centrado(APP_NAME).negrita().centrado('Remito de traslado').negrita(false)
  t.centrado(`${transfer.sourceBranch?.name || 'Origen'} → ${transfer.destinationBranch?.name || 'Destino'}`)
  t.centrado(fecha(transfer.createdAt))
  t.linea()
  for (const linea of lineas) {
    t.negrita().par(`${linea.sourceProduct?.name || 'Producto'} × ${linea.quantity || 1}`, '').negrita(false)
    const seriales = Array.isArray(linea.serials) ? linea.serials : []
    for (const serial of seriales) t.texto(`  ${serial}`)
  }
  t.linea()
  if (transfer.aexGuide) t.par('Guía AEX', transfer.aexGuide)
  if (transfer.createdBy?.name) t.par('Generado por', transfer.createdBy.name)
  if (transfer.notes) t.texto(transfer.notes)
  t.linea()
  t.centrado('Controlá el contenido contra este remito al recibir.')
  return t.avanza(2).corte()
}

// Comprobante de reserva: IMEI apartado, sucursal y vencimiento.
export function ticketReserva(reservation, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  t.centrado(APP_NAME).negrita().centrado('Comprobante de reserva').negrita(false)
  t.centrado(reservation.reservedUntil ? `Vence ${fecha(reservation.reservedUntil)}` : '')
  t.linea()
  t.par('Cliente', reservation.reservationCustomer || reservation.customerName || '—')
  t.texto(reservation.product?.name || reservation.productName || '—')
  if (reservation.serial) t.par('IMEI / serial', reservation.serial)
  if (reservation.branch?.name) t.par('Sucursal', reservation.branch.name)
  t.par('Vence', reservation.reservedUntil ? fecha(reservation.reservedUntil) : '—')
  t.linea()
  t.centrado('La unidad queda apartada hasta la fecha indicada. Pasado el vencimiento se libera automáticamente.')
  return t.avanza(2).corte()
}

// Página de prueba: valida texto, acentos, negrita, doble, QR y código de barras.
export function ticketPrueba({ ancho = 80, impresora = '', nombre = '' } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  t.centrado(APP_NAME)
  t.negrita().doble().centrado('TICKET DE PRUEBA').doble(false).negrita(false)
  t.linea()
  if (nombre) t.par('Impresora', nombre)
  if (impresora) t.par('Destino', impresora)
  t.par('Ancho', `${ancho} mm · ${t.columnas} columnas`)
  t.par('Fecha', fecha(new Date().toISOString()))
  t.linea()
  t.texto('Acentos: á é í ó ú ü ñ Ñ ¿? ¡!')
  t.negrita().texto('Negrita').negrita(false)
  t.doble().par('DOBLE', '123').doble(false)
  t.centrado('Centrado y alineado')
  t.linea()
  t.centrado('QR')
  t.qr(`MOBOS:TEST:${Date.now()}`, { tamano: 6 })
  t.centrado('Código de barras')
  t.barcode(`MOBOS-TEST-${Date.now()}`)
  t.linea()
  t.centrado('Si leés esto, la impresora quedó lista.')
  return t.avanza(2).corte()
}

// Varias etiquetas de unidad en un solo trabajo (una por etiqueta).
export function ticketEtiquetasUnidad(units = [], { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  for (const unit of units) etiquetaUnidadEn(t, unit)
  return t
}

// Etiqueta de una ubicación de stock: se escanea al recibir o trasladar.
export function ticketEtiquetaUbicacion(location, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  t.centrado(`${APP_NAME} · UBICACIÓN`)
  t.linea()
  t.negrita().texto(location?.name || 'Ubicación').negrita(false)
  if (location?.branch?.name) t.texto(location.branch.name)
  if (location?.code) t.texto(`Código: ${location.code}`)
  t.avanza(1)
  t.qr(`MOBOS:UBI:${location?.id || ''}`, { tamano: 7 })
  t.barcode(`MOBOS:UBI:${location?.id || ''}`)
  t.linea()
  t.centrado('Escaneá al recibir o trasladar para asignar esta ubicación.')
  return t.avanza(2).corte()
}
