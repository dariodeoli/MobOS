// Bloques comunes de todo papel (#426): los mismos del comprobante de venta
// aprobado — CLIENTE completo, PEDIDO, GARANTÍA Y CONDICIONES y el QR
// «Comprobante y seguimiento» con el enlace público — para el HTML (A4/80) y
// el ticket ESC/POS. Puro: sin DOM ni alias, así lo usan los tests de Node.
import { ESTADO_ENTREGA } from '../estadosPedido.js'

const texto = (valor) => String(valor ?? '').trim()
const esc = (valor) => String(valor ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))

export const ROTULO_QR = 'Comprobante y seguimiento'
export const AVISO_NO_FISCAL = 'Documento no fiscal · No válido como factura.'

// Texto de GARANTÍA Y CONDICIONES de los documentos que no son una venta (los
// de cambio, devolución y regalo usan la política de cambios de la tienda).
export const CONDICIONES = Object.freeze({
  recepcion: 'Conservá este comprobante como respaldo de la recepción. Las diferencias se reclaman al proveedor con este documento.',
  lista: 'Lista de trabajo del comprador. Controlá cantidades e IMEI contra la compra antes de cerrarla.',
  manifiesto: 'Controlá el contenido contra este manifiesto al recibir el lote; toda diferencia se registra en la recepción.',
  certificado: 'Constancia emitida por la tienda según la inspección registrada. Vale solo para el equipo y el IMEI indicados.',
  informe: 'Informe emitido por la tienda con los datos registrados del equipo. La garantía aplica según las condiciones de la tienda.',
  estacion: 'Hoja de trabajo interna del taller. Marcá cada equipo al verificarlo.',
  prueba: 'Ticket de prueba: confirma que la impresora, el ancho de papel y el corte funcionan.',
})

// Cliente completo del documento: nombre, documento, teléfono y correo. Sin
// nombre (o «Consumidor final» sin ningún dato) no hay bloque.
export function datosCliente(cliente = null) {
  if (!cliente) return null
  const crudo = typeof cliente === 'string' ? { name: cliente } : cliente
  const nombre = texto(crudo.name || crudo.nombre)
  if (!nombre) return null
  const documento = texto(crudo.document || crudo.documento || crudo.ruc)
  const telefono = [crudo.countryCode, crudo.phone || crudo.telefono].map(texto).filter(Boolean).join(' ')
  const email = texto(crudo.email)
  if (nombre === 'Consumidor final' && !documento && !telefono && !email) return null
  return { nombre, documento, telefono, email }
}

export const etiquetaEstadoPedido = (orden = {}) => ESTADO_ENTREGA[orden.fulfillmentStatus] || texto(orden.fulfillmentStatus) || ''

// Bloque PEDIDO: estado de entrega y vendedor cuando el pedido los trae.
export function datosPedido(orden = {}, extra = []) {
  const estado = etiquetaEstadoPedido(orden)
  const vendedor = texto(orden.seller?.name || orden.sellerName)
  const lineas = [vendedor ? `Vendedor: ${vendedor}` : '', ...extra].filter(Boolean)
  if (!estado && !lineas.length) return null
  return { estado, lineas }
}

// ── HTML ────────────────────────────────────────────────────────────
export function clienteHtml(cliente) {
  const datos = datosCliente(cliente)
  if (!datos) return ''
  const lineas = [datos.documento ? `Documento ${datos.documento}` : '', datos.telefono, datos.email].filter(Boolean)
  return `<div class="card"><div class="label">Cliente</div><div><strong>${esc(datos.nombre)}</strong>${lineas.map((linea) => `<br>${esc(linea)}`).join('')}</div></div>`
}

export function pedidoHtml(orden = {}, extra = []) {
  const datos = datosPedido(orden, extra)
  if (!datos && !extra.filter(Boolean).length) return ''
  const lineas = datos?.lineas || extra.filter(Boolean)
  const principal = datos?.estado || lineas[0]
  const resto = datos?.estado ? lineas : lineas.slice(1)
  return `<div class="card"><div class="label">Pedido</div><div><strong>${esc(principal)}</strong>${resto.map((linea) => `<br>${esc(linea)}`).join('')}</div></div>`
}

/** GARANTÍA Y CONDICIONES + QR con el enlace público (A4: lado a lado). */
export function pieDocumentoHtml({ condiciones = '', qrSrc = '', enlace = '', tieneQr = Boolean(enlace), termico = false, rotuloQr = ROTULO_QR, rotulo = 'Garantía y condiciones', aviso = AVISO_NO_FISCAL } = {}) {
  const textoCondiciones = [condiciones, aviso].filter(Boolean).map(esc).join('<br>')
  const qr = tieneQr
    ? `<div class="qrbox">${qrSrc ? `<img class="qr" src="${qrSrc}" alt="QR del comprobante">` : ''}<div class="small">${esc(rotuloQr)}${termico && enlace ? `: ${esc(enlace)}` : ''}</div></div>`
    : ''
  return `<div class="pie-doc"><div class="condiciones"><strong>${esc(rotulo)}</strong>${textoCondiciones}</div>${qr}</div>`
}

// ── ESC/POS ─────────────────────────────────────────────────────────
// Par «rótulo … valor» que no se recorta: si no entra, el valor baja a su línea.
export function parSeguro(t, izquierda, derecha) {
  if (String(izquierda).length + String(derecha).length + 1 <= t.columnas) t.par(izquierda, derecha)
  else { t.texto(izquierda); t.par('', derecha) }
}

export function clienteTicket(t, cliente) {
  const datos = datosCliente(cliente)
  if (!datos) return false
  t.texto('CLIENTE')
  t.negrita().texto(datos.nombre).negrita(false)
  if (datos.documento) parSeguro(t, 'Documento', datos.documento)
  if (datos.telefono) parSeguro(t, 'Teléfono', datos.telefono)
  if (datos.email) t.texto(datos.email)
  t.linea()
  return true
}

export function pedidoTicket(t, orden = {}, extra = []) {
  const datos = datosPedido(orden, extra)
  const lineas = datos?.lineas || extra.filter(Boolean)
  if (!datos?.estado && !lineas.length) return false
  t.texto('PEDIDO')
  if (datos?.estado) t.negrita().texto(datos.estado).negrita(false)
  for (const linea of lineas) t.texto(linea)
  t.linea()
  return true
}

/**
 * GARANTÍA Y CONDICIONES, QR y el enlace en texto (nunca recortado). `qr` es lo
 * que codifica el QR cuando no es el enlace (la tarjeta de regalo lleva el
 * código a canjear y no tiene página pública).
 */
export function pieDocumentoTicket(t, { condiciones = '', enlace = '', qr = enlace, rotuloQr = ROTULO_QR, rotulo = 'GARANTÍA Y CONDICIONES', aviso = AVISO_NO_FISCAL } = {}) {
  t.linea()
  t.texto(rotulo)
  if (condiciones) t.texto(condiciones)
  if (aviso) t.texto(aviso)
  if (qr) {
    t.avanza(1)
    t.centrado(rotuloQr)
    t.qr(qr, { tamano: t.columnas >= 48 ? 7 : 6 })
    if (enlace) t.texto(enlace)
  }
  return t
}
