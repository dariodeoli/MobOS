// Papel por tipo de operación (#426 idea 13): devolución, cambio, recibo de
// regalo y tarjeta de regalo. Datos puros para el HTML (A4/58/80) y el ticket
// ESC/POS: una sola resolución, y nunca costos ni datos internos (proveedor,
// código MOV, margen). El recibo de regalo ni siquiera lleva importes.
import { ETIQUETAS_MEDIO_PAGO } from '../constants.js'
import { documentoComprobante } from './ventaComprobante.js'
import { serialesDeItem } from './ventaPapel.js'

const texto = (valor) => String(valor ?? '').trim()
const numero = (valor) => {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

export const TIPOS_OPERACION = {
  devolucion: 'Devolución',
  cambio: 'Cambio',
  regalo: 'Recibo de regalo',
  giftcard: 'Tarjeta de regalo',
}

export const POLITICA_CAMBIO_POR_DEFECTO = 'Para cambiar o devolver este artículo presentá este recibo. Las condiciones de cambio son las de la tienda.'

// Etiqueta del medio de devolución/cobro: «Saldo a favor» cuando el reembolso
// quedó como nota de crédito.
export function etiquetaMedio(medio = '', modo = '') {
  if (String(modo).toUpperCase() === 'CREDIT') return 'Saldo a favor'
  const clave = texto(medio)
  return ETIQUETAS_MEDIO_PAGO[clave] || ETIQUETAS_MEDIO_PAGO[clave.toUpperCase()] || clave || 'Efectivo'
}

// Código de la tarjeta enmascarado: solo los últimos 4 (•••• •••• •••• 1234).
// `caracter` permite el asterisco en el ticket (la térmica no tiene viñeta).
export function codigoEnmascarado(tarjeta = {}, caracter = '•') {
  const ultimos = texto(tarjeta.codeLast4) || texto(tarjeta.code).replace(/[^0-9A-Za-z]/g, '').slice(-4)
  const grupo = caracter.repeat(4)
  return `${grupo} ${grupo} ${grupo} ${ultimos.toUpperCase().padStart(4, caracter)}`
}

function lineaPapel(item = {}, signo = 1) {
  const cantidad = Math.abs(numero(item.quantity)) || 1
  const unitario = Math.abs(numero(item.unitPricePyg))
  const total = Math.abs(numero(item.totalPyg)) || cantidad * unitario
  return {
    description: texto(item.description) || 'Producto',
    quantity: cantidad,
    unitPricePyg: signo * unitario,
    totalPyg: signo * total,
    seriales: serialesDeItem(item),
  }
}

// Cabecera común: empresa, sucursal, número de pedido de origen y fecha.
function cabecera(orden = {}, extra = {}) {
  return {
    empresa: orden.tenant?.name || orden.empresaNombre || '',
    ruc: orden.tenant?.ruc || '',
    direccion: [orden.tenant?.address, orden.tenant?.city].filter(Boolean).join(', '),
    sucursal: orden.branch?.name || '',
    sucursalDireccion: [orden.branch?.address, orden.branch?.city].filter(Boolean).join(', '),
    telefono: orden.branch?.phone || orden.tenant?.phone || '',
    cliente: orden.customer?.name || '',
    pedido: orden.orderNumber || orden.codigo || '',
    tenant: orden.tenant || null,
    branch: orden.branch || null,
    ...extra,
  }
}

/**
 * Devolución: los artículos devueltos van en negativo y el total reembolsado
 * (por medio) cierra el papel. `reembolsos` = [{ method, amountPyg }]; si no se
 * informan, se arma uno con `refundPyg` y el medio del cobro original.
 */
export function documentoDevolucion(entrada = {}, { items = null, reembolsos = null, refundPyg = null, refundMode = '', motivo = '', fecha = '' } = {}) {
  const orden = documentoComprobante(entrada)
  const origen = Array.isArray(items) && items.length ? items : orden.items
  const lineas = origen.map((item) => lineaPapel(item, -1))
  const cobroOriginal = (orden.payments || []).find((pago) => pago.status === 'CONFIRMED' || pago.status === undefined)
  const sumaItems = lineas.reduce((suma, linea) => suma + linea.totalPyg, 0)
  const total = refundPyg !== null && refundPyg !== undefined ? numero(refundPyg) : Math.abs(sumaItems)
  const metodos = (Array.isArray(reembolsos) && reembolsos.length
    ? reembolsos
    : [{ method: cobroOriginal?.method || cobroOriginal?.medioPago || 'CASH', amountPyg: total }])
    .map((reembolso) => ({
      label: etiquetaMedio(reembolso.method || reembolso.medioPago, reembolso.mode || refundMode),
      amountPyg: -Math.abs(numero(reembolso.amountPyg ?? reembolso.monto)),
    }))
  return {
    tipo: 'devolucion',
    titulo: 'DEVOLUCIÓN',
    ...cabecera(orden, { fecha: fecha || orden.createdAt || orden.creadoEn || '' }),
    items: lineas,
    motivo: texto(motivo),
    totalReembolsoPyg: -Math.abs(total),
    metodos,
  }
}

/**
 * Cambio: sección «Devueltos» (negativos) y «Nuevos», cada una con subtotal, y
 * el «Total de cambios»: A cobrar (nuevos > devueltos) o A devolver, con el
 * medio de pago o de reembolso.
 */
export function documentoCambio(entrada = {}, { devueltos = null, nuevos = [], medio = '', modo = '', fecha = '', motivo = '' } = {}) {
  const orden = documentoComprobante(entrada)
  const origen = Array.isArray(devueltos) && devueltos.length ? devueltos : orden.items
  const lineasDevueltas = origen.map((item) => lineaPapel(item, -1))
  const lineasNuevas = (Array.isArray(nuevos) ? nuevos : []).map((item) => lineaPapel(item, 1))
  const subtotalDevueltos = lineasDevueltas.reduce((suma, linea) => suma + linea.totalPyg, 0)
  const subtotalNuevos = lineasNuevas.reduce((suma, linea) => suma + linea.totalPyg, 0)
  const neto = subtotalNuevos + subtotalDevueltos
  const direccion = neto > 0 ? 'cobrar' : neto < 0 ? 'devolver' : 'ninguna'
  const cobroOriginal = (orden.payments || []).find((pago) => pago.status === 'CONFIRMED' || pago.status === undefined)
  return {
    tipo: 'cambio',
    titulo: 'CAMBIO',
    ...cabecera(orden, { fecha: fecha || orden.createdAt || orden.creadoEn || '' }),
    devueltos: lineasDevueltas,
    nuevos: lineasNuevas,
    subtotalDevueltosPyg: subtotalDevueltos,
    subtotalNuevosPyg: subtotalNuevos,
    totalCambioPyg: Math.abs(neto),
    direccion,
    rotuloTotal: direccion === 'cobrar' ? 'A cobrar' : direccion === 'devolver' ? 'A devolver' : 'Sin diferencia',
    medio: direccion === 'ninguna' ? '' : etiquetaMedio(medio || cobroOriginal?.method || cobroOriginal?.medioPago, modo),
    motivo: texto(motivo),
  }
}

/**
 * Recibo de regalo: solo artículos y cantidades, sin importes, cliente, pagos
 * ni IMEI. Lleva el número de pedido (para buscar el cambio), la tienda y la
 * nota de cambios.
 */
export function documentoRegalo(entrada = {}) {
  const orden = documentoComprobante(entrada)
  const politica = texto(orden.tenant?.exchangePolicy || orden.tenant?.returnPolicy || orden.exchangePolicy) || POLITICA_CAMBIO_POR_DEFECTO
  return {
    tipo: 'regalo',
    titulo: 'RECIBO DE REGALO',
    ...cabecera(orden, { fecha: orden.createdAt || orden.creadoEn || '', cliente: '' }),
    items: orden.items.map((item) => ({
      description: texto(item.description) || 'Producto',
      quantity: Math.abs(numero(item.quantity)) || 1,
    })),
    politica,
  }
}

/**
 * Tarjeta de regalo: monto grande, QR del código, código enmascarado y
 * vigencia. El QR lleva el código completo (lo lee el POS al canjear): solo
 * existe en la emisión, cuando el API lo devuelve una única vez; sin código
 * completo no se imprime QR.
 */
export function documentoTarjetaRegalo(tarjeta = {}, contexto = {}) {
  const code = texto(tarjeta.code)
  const vence = tarjeta.expiresAt ? new Date(tarjeta.expiresAt) : null
  return {
    tipo: 'giftcard',
    titulo: 'TARJETA DE REGALO',
    empresa: texto(contexto.empresa?.name || contexto.empresa?.nombre || (typeof contexto.empresa === 'string' ? contexto.empresa : '')),
    ruc: texto(contexto.empresa?.ruc),
    tenant: contexto.empresa && typeof contexto.empresa === 'object' ? contexto.empresa : null,
    branch: contexto.sucursal && typeof contexto.sucursal === 'object' ? contexto.sucursal : null,
    sucursal: texto(contexto.sucursal?.name || contexto.sucursal?.nombre),
    montoPyg: numero(tarjeta.amountPyg ?? tarjeta.balancePyg),
    codigoEnmascarado: codigoEnmascarado(tarjeta),
    codigoEnmascaradoTicket: codigoEnmascarado(tarjeta, '*'),
    qr: code,
    vence: vence && !Number.isNaN(vence.getTime()) ? vence.toISOString() : '',
    vigencia: vence && !Number.isNaN(vence.getTime())
      ? `Válida hasta el ${vence.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
      : 'Sin vencimiento',
    fecha: tarjeta.createdAt || '',
  }
}
