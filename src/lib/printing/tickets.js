// Tickets ESC/POS: mismo contenido que los comprobantes HTML, pero en comandos
// para la térmica (58/80 mm). El agente local solo transporta los bytes.
import { gs } from '../../utils/calculos.js'
import { APP_NAME } from '../brand.js'
import { ETIQUETAS_MEDIO_PAGO } from '../constants.js'
import { CHECKLISTS } from '../servicioChecklist.js'
import { datosDeCodigo, formatoDeCodigo, ETIQUETA_FORMATO } from './codigos.js'
import { bloqueFirma, crearTicket } from './escpos.js'
import { contextoEtiquetaUnidad, datosEtiquetaUnidad } from './etiquetaUnidad.js'
import { estadoGarantia, fechaVerificacionInforme } from './informeDispositivo.js'
import { baseDeApp, qrProducto, qrPrueba } from './qr.js'

const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }

const fecha = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '')

// Comprobante de compra. `link` es el enlace del nivel (se imprime como QR) y
// `logo` el raster monocromo de la empresa (GS v 0) para el encabezado.
export function ticketComprobante(order, { nivel = 'completo', ancho = 80, link = '', logo = null } = {}) {
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

  if (logo?.ancho && logo?.alto && logo.bytes) {
    t.imagenRaster(logo.bytes, { ancho: logo.ancho, alto: logo.alto })
    t.avanza(1)
  }
  t.centrado([empresa || APP_NAME, sucursal?.name].filter(Boolean).join(' · ')).negrita().centrado('Comprobante de compra').negrita(false)
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
// o para un lote, sin duplicar el diseño). `base` es la base de la app para el
// QR: sin base no se imprime un código muerto (ver `qr.js`).
// Etiqueta de una unidad de stock (#220): modelo, identificador, IMEI/serial
// completo legible, QR y código de barras en bloques separados por líneas, para
// que no se confunda qué código escanear. El diseño de 58 mm no es el de 80
// escalado: el serial va en doble ancho solo cuando entra completo.
function etiquetaUnidadEn(t, unit, { base = baseDeApp() } = {}) {
  const datos = datosEtiquetaUnidad(unit, { base })
  const contexto = contextoEtiquetaUnidad(datos)
  t.centrado(`${APP_NAME} · ETIQUETA DE UNIDAD`)
  t.linea()
  t.negrita().texto(datos.modelo).negrita(false)
  if (contexto) t.texto(contexto)
  t.linea()
  // Identificador: el número corto que se tipea o se dicta.
  t.centrado('IDENTIFICADOR')
  t.negrita().doble().centrado(datos.identificador).doble(false).negrita(false)
  if (datos.serial) {
    t.centrado('IMEI / SERIAL')
    if (t.columnas >= datos.serial.length * 2) t.doble().centrado(datos.serial).doble(false)
    else t.centrado(datos.serial)
  }
  t.linea()
  if (datos.enlace) t.qr(datos.enlace, { tamano: 7, etiqueta: 'CÓDIGO QR' })
  t.linea()
  if (datos.codigo) {
    t.barcode(datos.codigo, { etiqueta: 'CÓDIGO DE UNIDAD' })
    t.centrado(datos.codigo)
  }
  t.linea()
  t.centrado('Escaneá para buscar, vender o verificar esta unidad.')
  return t.avanza(2).corte()
}

// Etiqueta de una unidad de stock: producto, estado, IMEI y QR/código de barras.
export function ticketEtiquetaUnidad(unit, { ancho = 80, base = baseDeApp() } = {}) {
  return etiquetaUnidadEn(crearTicket({ ancho }).iniciar(), unit, { base })
}

// Etiqueta de precio/góndola con QR que abre el producto.
export function ticketEtiquetaPrecio(product, { ancho = 80, base = baseDeApp() } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const precio = Number(product.pricePyg ?? product.precioVenta ?? 0)
  const mayorista = Number(product.wholesalePricePyg ?? 0)
  const enlace = qrProducto(product.sku || product.id || '', base)
  t.centrado(`${APP_NAME} · ETIQUETA DE PRECIO`)
  t.linea()
  t.negrita().texto(product.name || '').negrita(false)
  if (product.sku) t.texto(product.sku)
  t.avanza(1)
  t.centrado(precio > 0 ? gs(precio) : '—')
  if (mayorista > 0) t.centrado(`Mayorista: ${gs(mayorista)}`)
  t.avanza(1)
  if (enlace) t.qr(enlace, { tamano: 6, etiqueta: 'QR del producto' })
  return t.avanza(2).corte()
}

// Una etiqueta de producto/góndola dentro de un ticket ya abierto: nombre,
// precio, SKU y código de barras sobre el SKU (EAN-13 si el SKU lo es; si no,
// CODE128). `precioPyg` permite pasar el precio ya resuelto por la lista del
// cliente o el escalón; sin eso se usa pricePyg. Cada etiqueta corta al final
// para poder despegarla.
function etiquetaProductoEn(t, product, { precioPyg = null, lista = '', indice = 0, total = 1 } = {}) {
  const nombre = product?.name || product?.nombre || 'Producto'
  const sku = String(product?.sku || '')
  const codigo = sku || String(product?.id || '')
  const formato = formatoDeCodigo(codigo)
  const precio = Number(precioPyg ?? product?.pricePyg ?? product?.precioVenta ?? 0)
  t.centrado(`${APP_NAME} · ETIQUETA DE PRODUCTO`)
  t.linea()
  t.negrita().texto(nombre).negrita(false)
  t.avanza(1)
  t.doble().centrado(precio > 0 ? gs(precio) : '—').doble(false)
  if (precioPyg != null && lista) t.centrado(`Lista: ${lista}`)
  t.linea()
  if (sku) t.par('SKU', sku)
  if (total > 1) t.par('Etiqueta', `${indice + 1} de ${total}`)
  t.avanza(1)
  t.barcode(datosDeCodigo(codigo), { etiqueta: ETIQUETA_FORMATO[formato], formato })
  return t.avanza(2).corte()
}

// Etiqueta de góndola de un producto. `cantidad` imprime esa cantidad de
// etiquetas (una por corte) y `precioPyg`/`lista` dejan imprimir el precio de
// la lista del cliente o del escalón por cantidad; sin eso va el pricePyg.
export function ticketEtiquetaProducto(product, { ancho = 80, cantidad = 1, precioPyg = null, lista = '' } = {}) {
  const total = Math.max(1, Math.min(99, Number(cantidad) || 1))
  const t = crearTicket({ ancho }).iniciar()
  for (let indice = 0; indice < total; indice += 1) etiquetaProductoEn(t, product, { precioPyg, lista, indice, total })
  return t
}

// Lote de etiquetas de góndola: `items` = [{ product, cantidad, precioPyg, lista }].
export function ticketEtiquetasProducto(items = [], { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  for (const item of Array.isArray(items) ? items : []) {
    const total = Math.max(1, Math.min(99, Number(item?.cantidad) || 1))
    for (let indice = 0; indice < total; indice += 1) {
      etiquetaProductoEn(t, item?.product || item, { precioPyg: item?.precioPyg, lista: item?.lista, indice, total })
    }
  }
  return t
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
  marca = '',
  base = baseDeApp(),
} = {}) {
  // Método honesto: lo informa quien arma el ticket (CUPS local, LAN TCP,
  // CUPS-USB…); el prefijo `usb:` es histórico y no implica cable USB.
  const metodoReal = metodo || (/^(usb|cups):/.test(String(impresora || '')) ? 'CUPS (cola local)' : 'LAN (TCP directo)')
  const conexionReal = /^(usb|cups)/.test(String(conexion || '')) ? 'Cola CUPS local' : 'LAN (TCP directo)'
  const validacion = pruebaAleatoria()
  const sufijo = pruebaSufijo()
  const validador = `${validacion}-${sufijo}`
  const ref = refDePrueba()
  const ahora = new Date().toISOString()
  // El QR de la prueba abre una página autocontenida: destino, validación,
  // fecha y formato viajan en la URL (esta prueba no vive en la base).
  const enlacePrueba = qrPrueba({ destino: impresora, validacion, fecha: ahora, tipo }, base)
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
    t.par('Fecha', fecha(ahora))
    t.par('Equipo', equipo || '—')
    t.par('Trabajo', ref)
  }

  // Cuerpo común de códigos: QR + barras con su rótulo, siempre centrados.
  const codigos = (sufijo) => {
    t.linea()
    t.centrado('Escanear')
    // Con base de la app el QR abre la prueba (destino, validación y fecha);
    // sin base igual se imprime un QR de trazabilidad (no un código muerto).
    t.qr(enlacePrueba || `MOBOS:PRUEBA:${sufijo}:${validacion}`, { tamano: 6, etiqueta: 'QR' })
    t.barcode(`MOBOS-${sufijo}-${validacion}`, { etiqueta: 'Código de barras' })
    t.linea()
    t.texto('Acentos: á é í ó ú ü ñ Ñ ¿? ¡!')
  }

  t.centrado(APP_NAME).negrita().doble().centrado('TICKET DE PRUEBA').doble(false).negrita(false)
  t.centrado(TIPOS_PRUEBA[tipo] || 'Prueba')
  // Marca de la corrida comparativa: el mismo texto en las tres impresoras
  // permite reconocer el papel y cruzar los trabajos con las métricas.
  if (marca) t.centrado(`Comparativa ${marca}`)
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
export function ticketEtiquetasUnidad(units = [], { ancho = 80, base = baseDeApp() } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  for (const unit of units) etiquetaUnidadEn(t, unit, { base })
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

// Pie común de los documentos no fiscales: la leyenda tiene que verse en el
// papel, no solo en la pantalla.
const LEYENDA_NO_FISCAL = 'Documento no fiscal. No válido como factura.'

// Nota de entrega: respalda la entrega física de la mercadería con el receptor
// y su firma. Sin precios: el comprobante de venta ya los detalla.
export function ticketNotaEntrega(order, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const items = Array.isArray(order.items) ? order.items : []
  const empresa = order.tenant?.name || order.empresaNombre || ''
  const sucursal = order.branch || null
  const cliente = order.customer || null
  t.centrado(empresa || APP_NAME).negrita().centrado('Nota de entrega').negrita(false)
  t.centrado(`${order.orderNumber || order.codigo || 'Pedido'} · ${fecha(order.createdAt || order.creadoEn || order.fecha)}`)
  t.linea()
  if (sucursal?.name) t.texto(sucursal.name)
  t.par('Cliente', cliente?.name || order.cliente || 'Consumidor final')
  if (cliente?.document) t.par('Documento', cliente.document)
  const direccion = [order.deliveryAddress?.address, order.deliveryAddress?.city, order.deliveryAddress?.department].filter(Boolean).join(', ')
  if (direccion) t.texto(`Dirección: ${direccion}`)
  if (order.deliveryType || order.deliveryNotes) t.texto(`Entrega: ${order.deliveryType || '—'}${order.deliveryNotes ? ` · ${order.deliveryNotes}` : ''}`)
  t.linea()
  let unidades = 0
  for (const item of items) {
    const cantidad = Number(item.quantity || 1)
    unidades += cantidad
    t.par(item.description || item.nombre || 'Producto', `x${cantidad}`)
  }
  t.linea()
  t.par('Total de unidades', String(unidades))
  t.avanza(1)
  t.texto('Recibí conforme la mercadería detallada.')
  bloqueFirma(t, ['Recibí conforme'], { ancho, observaciones: true })
  t.linea()
  t.centrado(LEYENDA_NO_FISCAL)
  return t.avanza(2).corte()
}

// Remisión: traslado interno entre sucursales con las firmas de quien despacha
// y quien recibe. El remito de traslado ya lista los IMEI; esta nota agrega el
// control firmado de entrega y recepción.
export function ticketRemision(transfer, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const lineas = Array.isArray(transfer.lines) ? transfer.lines : []
  t.centrado(APP_NAME).negrita().centrado('Remisión interna').negrita(false)
  t.centrado(`${transfer.sourceBranch?.name || 'Origen'} -> ${transfer.destinationBranch?.name || 'Destino'}`)
  t.centrado(fecha(transfer.createdAt))
  t.linea()
  for (const linea of lineas) {
    t.negrita().par(`${linea.sourceProduct?.name || 'Producto'} x${linea.quantity || 1}`, '').negrita(false)
    const seriales = Array.isArray(linea.serials) ? linea.serials : []
    for (const serial of seriales) t.texto(`  ${serial}`)
  }
  t.linea()
  if (transfer.aexGuide) t.par('Guía AEX', transfer.aexGuide)
  if (transfer.createdBy?.name) t.par('Despachado por', transfer.createdBy.name)
  if (transfer.notes) t.texto(transfer.notes)
  if (transfer.destinationLocation?.name) t.texto(`Destino en depósito: ${transfer.destinationLocation.name}`)
  bloqueFirma(t, ['Entregué (despacho)', 'Recibí conforme (recepción)'], { ancho, observaciones: true })
  t.linea()
  t.centrado(LEYENDA_NO_FISCAL)
  return t.avanza(2).corte()
}

// Recibo interno de un cobro puntual (no fiscal): monto, medio y referencia,
// con las firmas de quien recibe y quien entrega.
export function ticketReciboInterno(payment = {}, order = {}, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const monto = payment.amountPyg ?? payment.monto ?? 0
  const metodo = ETIQUETAS_MEDIO_PAGO[payment.method] || payment.medioPago || 'Pago'
  const referencia = payment.reference || payment.cuenta || payment.accountSnapshot?.name || ''
  const cuando = payment.paidAt || payment.createdAt || payment.fecha || new Date().toISOString()
  const pedido = order.orderNumber || order.codigo || 'Pedido'
  const numero = payment.receiptNumber || payment.number || `${pedido}-${String(payment.id || '').slice(-4).toUpperCase() || 'R'}`
  t.centrado(APP_NAME).negrita().centrado('Recibo interno').negrita(false)
  t.centrado(`N.º ${numero}`)
  t.centrado(fecha(cuando))
  t.linea()
  t.par('Recibí de', order.customer?.name || order.cliente || 'Consumidor final')
  t.texto(`Concepto: cobro del pedido ${pedido}`)
  t.linea()
  t.par('Medio', metodo)
  if (referencia) t.par('Referencia', referencia)
  if (payment.settlesAt) t.par('Acredita', fecha(payment.settlesAt))
  t.doble().par('TOTAL', gs(monto)).doble(false)
  t.avanza(1)
  bloqueFirma(t, ['Entregué / cobré', 'Recibí conforme'], { ancho, observaciones: true })
  t.linea()
  t.centrado(LEYENDA_NO_FISCAL)
  return t.avanza(2).corte()
}

// Proforma / presupuesto de una cotización: mismos ítems, precios y validez,
// con la leyenda de que no tiene validez fiscal.
export function ticketProforma(quote = {}, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const items = Array.isArray(quote.items) ? quote.items : []
  const empresa = quote.tenant?.name || quote.companyName || ''
  t.centrado(empresa || APP_NAME).negrita().centrado('Factura proforma').negrita(false)
  t.centrado(`Presupuesto ${quote.number || ''}`)
  t.centrado(fecha(quote.createdAt))
  t.linea()
  t.par('Cliente', quote.customer?.name || quote.customerName || 'Consumidor final')
  if (quote.customer?.document) t.par('Documento', quote.customer.document)
  if (quote.validUntil) t.par('Validez', `hasta ${fecha(quote.validUntil)}`)
  t.linea()
  for (const item of items) {
    const cantidad = Number(item.quantity || 1)
    const unitario = Number(item.unitPricePyg ?? 0)
    const lineaTotal = Number(item.totalPyg ?? cantidad * unitario)
    t.texto(item.description || 'Producto')
    t.par(`  ${cantidad} x ${gs(unitario)}`, gs(lineaTotal))
  }
  t.linea()
  t.par('Subtotal', gs(quote.subtotalPyg ?? quote.totalPyg ?? 0))
  const descuento = Number(quote.discountPyg || 0)
  if (descuento) t.par('Descuento', `- ${gs(descuento)}`)
  t.doble().par('TOTAL', gs(quote.totalPyg ?? 0)).doble(false)
  if (quote.notes) { t.linea(); t.texto(quote.notes) }
  bloqueFirma(t, ['Aceptación del cliente'], { ancho, observaciones: true })
  t.linea()
  t.centrado(LEYENDA_NO_FISCAL)
  return t.avanza(2).corte()
}

// Liquidación de comisiones de un vendedor: período, detalle congelado por
// venta (base y comisión) y total a pagar, con el QR que verifica el
// comprobante sin sesión. Es la copia en papel del comprobante del panel.
export function ticketLiquidacionComision(settlement = {}, { ancho = 80, link = '' } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const lines = Array.isArray(settlement.lines) ? settlement.lines : []
  const estado = settlement.status === 'PAID' ? `Pagada${settlement.paidAt ? ` · ${fecha(settlement.paidAt)}` : ''}` : settlement.status === 'CANCELLED' ? 'ANULADA' : 'Borrador'
  t.centrado(APP_NAME).negrita().centrado('Liquidación de comisiones').negrita(false)
  t.centrado(`N.º ${String(settlement.id || '').slice(-6).toUpperCase() || '—'}`)
  t.centrado(fecha(settlement.createdAt || new Date().toISOString()))
  t.linea()
  t.par('Vendedor', settlement.sellerName || '—')
  t.par('Período', `${settlement.periodFrom || '—'} al ${settlement.periodTo || '—'}`)
  if (settlement.commissionPct !== null && settlement.commissionPct !== undefined) t.par('Comisión', `${Number(settlement.commissionPct)}% sobre margen`)
  t.par('Estado', estado)
  t.linea()
  for (const line of lines) {
    t.texto(`${line.orderNumber || 'Venta'}${line.date ? ` · ${line.date}` : ''}`)
    t.par(`  Base ${gs(line.basePyg || 0)}`, gs(line.commissionPyg || 0))
  }
  t.linea()
  t.par('Margen liquidado', gs(settlement.marginPyg || 0))
  t.doble().par('TOTAL A PAGAR', gs(settlement.totalPyg || 0)).doble(false)
  t.avanza(1)
  if (link) {
    t.centrado('Verificación del comprobante')
    t.qr(link, { tamano: 7 })
    t.texto(link)
  }
  t.linea()
  t.texto('Recibí conforme: _______________________')
  t.texto('Aclaración: ____________________________')
  t.linea()
  t.centrado(LEYENDA_NO_FISCAL)
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

// Comprobante de verificación de IMEI (#203): la info mínima y honesta para el
// cliente (estado, fecha y fuente). Nunca costos, respuestas crudas ni datos
// internos; si la consulta fue simulada (demo) se imprime el aviso.
// Informe de dispositivo imprimible (#240): equipo, verificación IMEI,
// inspección física, garantía y el QR al informe público. Mismo dato que el
// HTML (`datosInformeDispositivo`), una columna con bloques separados.
export function ticketInformeDispositivo(datos = {}, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const inspeccion = datos.inspeccion || {}
  const garantia = estadoGarantia(datos)
  // En 58 mm las etiquetas largas con valor al lado se cortan: van apiladas.
  const estrecho = Number(ancho) <= 58
  const par = (etiqueta, valor) => {
    if (!valor) return
    if (estrecho) { t.texto(etiqueta); t.par('  ', String(valor)) } else t.par(etiqueta, valor)
  }
  t.centrado(APP_NAME).negrita().centrado('INFORME DE DISPOSITIVO').negrita(false)
  if (datos.sucursal) t.centrado(datos.sucursal)
  t.centrado(`Emitido ${datos.fechaEmision || ''}`)
  t.linea()

  t.negrita().texto('Equipo').negrita(false)
  t.texto(datos.modelo || 'Producto')
  par('IMEI', datos.imei || '—')
  par('Serial', datos.serialImpreso)
  par('Condición', datos.condicion)
  par('Batería', datos.bateria)
  par('Ubicación', datos.ubicacion)
  par('Proveedor', datos.proveedor)
  t.linea()

  t.negrita().texto('Verificación IMEI').negrita(false)
  if (datos.verificacion) {
    const v = datos.verificacion
    par('Estado', `${v.etiqueta || 'No verificado'}${v.simulado ? ' (simulada)' : ''}`)
    if (v.detalle) t.texto(v.detalle)
    for (const campo of v.campos || []) par(campo.etiqueta, campo.valor)
    if (v.fuente) t.texto(`Fuente ${v.fuente}${v.fechaTexto ? ` · ${v.fechaTexto}` : ''}`)
  } else {
    t.texto('Sin consulta de IMEI registrada.')
  }
  t.linea()

  t.negrita().texto('Inspección física').negrita(false)
  par('Verificado por', inspeccion.verificador)
  par('Verificado el', fechaVerificacionInforme(datos))
  par('Verificaciones', inspeccion.verificaciones ? String(inspeccion.verificaciones) : '')
  par('Grado', inspeccion.grado || 'Sin grado asignado')
  if (inspeccion.total) par('Checklist', `${inspeccion.aprobados}/${inspeccion.total}${inspeccion.puntaje ? ` · puntaje ${inspeccion.puntaje}` : ''}`)
  if (!inspeccion.verificador && !inspeccion.grado) t.texto('Sin verificación física registrada.')
  t.linea()

  t.negrita().texto('Garantía de la tienda').negrita(false)
  par('Estado', garantia.etiqueta)
  par('Vence el', garantia.hasta)
  t.linea()

  if (datos.enlace) t.qr(datos.enlace, { tamano: 7, etiqueta: 'INFORME DEL DISPOSITIVO' })
  if (datos.enlace) t.centrado(datos.enlace)
  t.linea()
  t.centrado('Documento informativo · no válido como factura')
  t.centrado(`Generado por ${APP_NAME}${datos.emisor ? ` para ${datos.emisor}` : ''}`)
  return t.avanza(2).corte()
}

export function ticketVerificacionImei(resumen, { ancho = 80 } = {}) {  const t = crearTicket({ ancho }).iniciar()
  const fechaTexto = resumen?.fecha ? new Date(resumen.fecha).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : ''
  t.centrado(APP_NAME).negrita().centrado('Verificación de IMEI').negrita(false)
  if (resumen?.simulado) t.centrado('(simulada)')
  t.linea()
  t.par('IMEI', resumen?.imei || '—')
  t.par('Estado', resumen?.etiqueta || 'No verificado')
  if (resumen?.detalle) t.texto(resumen.detalle)
  t.linea()
  t.par('Fecha', fechaTexto || '—')
  t.par('Fuente', resumen?.fuente || 'IMEIcheck.net')
  if (resumen?.cliente) t.par('Cliente', resumen.cliente)
  t.linea()
  t.texto('Comprobante informativo: no acredita propiedad ni reemplaza la')
  t.texto('verificación oficial del equipo.')
  t.texto('Documento no fiscal.')
  return t.avanza(2).corte()
}
