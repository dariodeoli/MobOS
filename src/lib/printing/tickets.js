// Tickets ESC/POS: mismo contenido que los comprobantes HTML, pero en comandos
// para la térmica (58/80 mm). El agente local solo transporta los bytes.
import { gs } from '../../utils/calculos.js'
import { APP_NAME } from '../brand.js'
import { ETIQUETAS_MEDIO_PAGO } from '../constants.js'
import { CHECKLISTS } from '../servicioChecklist.js'
import { crearTicket } from './escpos.js'

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
  const itemsCount = items.reduce((suma, item) => suma + Number(item.quantity || 1), 0)
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
    if (order.tenant?.ruc) t.texto(`RUC ${order.tenant.ruc}`)
    const direccionEmpresa = [order.tenant?.address, order.tenant?.city, order.tenant?.department].filter(Boolean).join(', ')
    if (direccionEmpresa) t.texto(direccionEmpresa)
    if (order.tenant?.phone) t.texto(order.tenant.phone)
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

  t.par('Total de ítems', String(itemsCount))
  t.par('Subtotal', gs(order.subtotalPyg ?? total))
  const descuento = Number(order.discountPyg || order.descuento || 0)
  if (descuento) t.par('Descuento', `- ${gs(descuento)}`)
  const entrega = Number(order.deliveryPyg || order.montoDelivery || 0)
  if (entrega) t.par('Entrega', gs(entrega))
  t.doble().par('TOTAL', gs(total)).doble(false)
  t.par('Pagado', gs(pagado || order.totalPagado || 0))
  if (pendiente > 0) {
    t.negrita().texto('SALDO PENDIENTE').negrita(false)
    t.negrita().doble().par('', gs(pendiente)).doble(false).negrita(false)
  }

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
    t.qr(link, { tamano: 7 })
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
    t.qr(`MOBOS:${serial}`, { tamano: 7, etiqueta: 'QR de la unidad' })
    t.barcode(`MOBOS:${serial}`, { etiqueta: 'Código de barras' })
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
  t.qr(`MOBOS:PROD:${product.sku || product.id || ''}`, { tamano: 6, etiqueta: 'QR del producto' })
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

const pruebaAleatoria = () => String(Math.floor(1000 + Math.random() * 9000)) // exactamente 4 dígitos
// Sufijo secreto: solo sale impreso en el papel; la app lo guarda para que el
// operador confirme la impresión escribiéndolo en Actividad de impresión.
const pruebaSufijo = () => String(Math.floor(Math.random() * 10))
const refDePrueba = () => `TEST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`

const TIPOS_PRUEBA = {
  'corta': 'Prueba corta',
  'pedido': 'Ticket de pedido',
  'qr': 'Ticket con QR',
  'venta': 'Ticket completo de venta',
  'caracteres': 'Caracteres y formato',
  'corte': 'Prueba de corte',
}
export const TIPOS_TICKET_PRUEBA = TIPOS_PRUEBA

// Ticket de prueba con trazabilidad completa: impresora, método, conexión,
// puente, token (enmascarado), usuario, equipo, trabajo, validación de 4
// dígitos y corte final. Todos los tipos comparten cabecera, bloque QR/barras,
// acentos, pie de trazabilidad y corte.
export function ticketPruebaTipo(tipo, {
  ancho = 80,
  impresora = '',
  nombre = '',
  equipo = '',
  copias = 1,
  metodo = '',
  conexion = '',
  puente = '',
  tokenPista = '',
  usuario = '',
} = {}) {
  // Método honesto: lo informa quien arma el ticket (CUPS local, LAN TCP,
  // CUPS-USB…); el prefijo `usb:` es histórico y no implica cable USB.
  const metodoReal = metodo || (/^(usb|cups):/.test(String(impresora || '')) ? 'CUPS (cola local)' : 'LAN (TCP directo)')
  const conexionReal = /^(usb|cups)/.test(String(conexion || '')) ? 'Cola CUPS local' : 'LAN (TCP directo)'
  const validacion = pruebaAleatoria()
  const sufijo = pruebaSufijo()
  const validador = `${validacion}-${sufijo}`
  const ref = refDePrueba()
  const t = crearTicket({ ancho }).iniciar()

  // Pie común: todo lo que hace auditable la prueba desde el papel.
  const pie = () => {
    t.linea()
    t.negrita().centrado(`VALIDACIÓN ${validador}`).negrita(false)
    t.linea()
    t.par('Impresora', nombre || '—')
    t.par('Método', metodoReal)
    t.par('Conexión', conexionReal)
    t.par('Destino', impresora || '—')
    t.par('Puente', puente || '—')
    t.par('Token', tokenPista || 'sin token')
    t.par('Ancho', `${ancho} mm`)
    t.par('Copias', String(copias))
    t.par('Usuario', usuario || '—')
    t.par('Fecha', fecha(new Date().toISOString()))
    t.par('Equipo', equipo || '—')
    t.par('Trabajo', ref)
  }

  // Cuerpo común de códigos: QR + barras con su rótulo, siempre centrados.
  const codigos = (sufijo) => {
    t.linea()
    t.centrado('Escanear')
    t.qr(`MOBOS:PRUEBA:${sufijo}:${validacion}`, { tamano: 6, etiqueta: 'QR' })
    t.barcode(`MOBOS-${sufijo}-${validacion}`, { etiqueta: 'Código de barras' })
    t.linea()
    t.texto('Acentos: á é í ó ú ü ñ Ñ ¿? ¡!')
  }

  t.centrado(APP_NAME).negrita().doble().centrado('TICKET DE PRUEBA').doble(false).negrita(false)
  t.centrado(TIPOS_PRUEBA[tipo] || 'Prueba')
  t.linea()
  // El validador va grande y arriba (y se repite en el pie): si algo cortara la
  // impresión, el código secreto igual salió en el papel.
  t.negrita().doble().centrado(`VALIDACIÓN ${validador}`).doble(false).negrita(false)
  t.linea()

  if (tipo === 'corta') {
    t.par('Prueba', metodoReal)
    t.par('Destino', impresora || '—')
    t.par('Resultado', 'PENDIENTE')
    codigos('CORTA')
  }

  if (tipo === 'pedido') {
    const pedido = `P-${pruebaAleatoria()}`
    t.par('Pedido', pedido)
    t.par('Cliente', 'Cliente de prueba')
    t.linea()
    t.texto('iPhone 16 Pro 128GB')
    t.par('  x1', '7.950.000')
    t.texto('Case MagSafe silicona')
    t.par('  x1', '180.000')
    t.texto('Lámina 9H')
    t.par('  x2', '60.000')
    t.linea()
    t.par('Subtotal', '8.250.000')
    t.par('Descuento', '-250.000')
    t.negrita().par('Total', '8.000.000').negrita(false)
    t.par('Medio de pago', 'Efectivo')
    t.par('Vendedor', 'Vendedor de prueba')
    codigos('PEDIDO')
  }

  if (tipo === 'qr') {
    t.par('Pedido', `P-${pruebaAleatoria()}`)
    t.par('Cliente', 'Cliente de prueba')
    t.negrita().par('Total', '1.234.000').negrita(false)
    codigos('QR')
  }

  if (tipo === 'venta') {
    t.centrado(`${APP_NAME} · SUCURSAL CENTRAL`).centrado('Comprobante de venta')
    t.linea()
    t.par('Fecha', fecha(new Date().toISOString()))
    t.par('Vendedor', 'Vendedor de prueba')
    t.par('Cliente', 'Cliente de prueba')
    t.linea()
    t.texto('iPhone 16 Pro 128GB')
    t.par('  x1', '7.950.000')
    t.texto('Case MagSafe silicona')
    t.par('  x1', '180.000')
    t.linea()
    t.par('Subtotal', '8.130.000')
    t.par('IVA 10%', '813.000')
    t.negrita().par('Total', '8.943.000').negrita(false)
    t.par('Medio de pago', 'Transferencia')
    codigos('VENTA')
  }

  if (tipo === 'caracteres') {
    t.texto('Texto normal')
    t.negrita().texto('Negrita').negrita(false)
    t.doble().par('DOBLE', '123').doble(false)
    t.centrado('Centrado')
    t.par('Columna izquierda', 'derecha')
    codigos('CHARS')
  }

  if (tipo === 'corte') {
    t.par('Prueba', 'Corte físico por variantes')
    t.linea()
    t.texto('Cada sección etiquetada intenta un corte distinto: mirá en qué sección se separó el papel.')
    t.linea()
    t.centrado('1) GS V 0 · completo')
    t.texto('Corte completo puro (el estándar de recibos).')
    t.avanza(1).corte('completo')
    t.centrado('2) GS V 1 · parcial')
    t.texto('Corte parcial: deja una tirita sin cortar.')
    t.avanza(1).corte('parcial')
    t.centrado('3) GS V 65 0 · avanza + completo')
    t.texto('Primero avanza hasta la cuchilla y después corta todo.')
    t.avanza(1).corte('avanza-completo')
    t.centrado('4) GS V 66 0 · avanza + parcial')
    t.texto('Avanza hasta la cuchilla y corta parcial.')
    t.avanza(1).corte('avanza-parcial')
    t.linea()
    t.texto('Si ninguna cortó, revisá Cutter Enable: YES y que el rollo esté bien cargado.')
    codigos('CORTE')
  }

  pie()
  t.avanza(2).corte()
  return { base64: () => t.base64(), lineas: () => t.lineas(), ref, validacion, sufijo, validador, corte: t.corteEnviado() }
}

// Compatibilidad con el flujo anterior: la prueba clásica de caracteres.
export function ticketPrueba(opciones = {}) {
  return ticketPruebaTipo('caracteres', opciones)
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
  t.qr(`MOBOS:UBI:${location?.id || ''}`, { tamano: 7, etiqueta: 'QR de la ubicación' })
  t.barcode(`MOBOS:UBI:${location?.id || ''}`, { etiqueta: 'Código de barras' })
  t.linea()
  t.centrado('Escaneá al recibir o trasladar para asignar esta ubicación.')
  return t.avanza(2).corte()
}

// Recepción de servicio técnico para ticketera: datos, desbloqueo, checklist
// marcado y firma. Usa [x]/[ ] porque la térmica no imprime los símbolos ☑/☐.
export function ticketRecepcionServicio(order, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const tipo = order.deviceType || 'iPhone'
  const marcados = order.checklist && typeof order.checklist === 'object' ? order.checklist : {}
  const puntos = CHECKLISTS[tipo] || CHECKLISTS.Otros
  t.centrado(APP_NAME).negrita().centrado('Recepción de servicio').negrita(false)
  t.centrado(`Orden ${order.serviceNumber || '—'}`)
  t.centrado(fecha(order.receivedAt || order.createdAt))
  t.linea()
  t.par('Cliente', order.customerName || '—')
  t.par('Equipo', order.device || '—')
  if (order.serial) t.par('Serie', order.serial)
  const desbloqueo = [order.unlockCode, Array.isArray(order.unlockPattern) && order.unlockPattern.length ? `patrón ${order.unlockPattern.join('-')}` : ''].filter(Boolean).join(' · ')
  if (desbloqueo) t.par('Desbloqueo', desbloqueo)
  t.par('Precio', gs(order.pricePyg || 0))
  t.linea()
  t.negrita().texto('Checklist').negrita(false)
  for (const punto of puntos) t.texto(`${marcados[punto] ? '[x]' : '[ ]'} ${punto}`)
  t.linea()
  if (order.reportedIssue) t.texto(`Falla declarada: ${order.reportedIssue}`)
  t.linea()
  t.texto('VERIFIQUE EL DISEÑO ANTES DE FIRMAR.')
  t.texto('Firma del cliente: ______________________')
  return t.avanza(2).corte()
}
