// Etiqueta de envío 10 × 15 cm (100 × 150 mm, el formato 4×6" de Mercado Libre y
// de las impresoras térmicas de etiquetas tipo Zebra/Xprinter). Una página por
// bulto. Puro: sin DOM ni alias, así lo usan los tests de Node; el armado con
// QR, logo y código de barras vive en `etiquetaEnvioImpresion.js`.
//
// Contenido (alto contraste, legible en blanco y negro): remitente (tienda),
// DESTINATARIO grande, número de pedido grande, método de entrega, «bulto 1 de
// 2», contra reembolso con el monto a cobrar (o «PAGADO»), fecha, QR del
// seguimiento público del pedido y código de barras Code128 del número.
//
// El QR NO inventa un enlace: es el mismo del comprobante (`/pedidos/<token>`,
// docs/TOKENS.md) y llega ya resuelto en `enlace`.
import { codigoPedido, totalesPedido } from '../../utils/pedido.js'
import { gs } from '../../utils/calculos.js'
import { telefonoVisible } from '../../utils/telefono.js'

export const ETIQUETA_ENVIO_MM = Object.freeze({ ancho: 100, alto: 150 })
export const PAGINA_CSS_ENVIO = '@page{size:100mm 150mm;margin:0}'
export const MAX_BULTOS = 20
export const MAX_ETIQUETAS_ENVIO = 200
export const TIPO_IMPRESION_ENVIO = 'etiqueta-envio'
export const VARIANTES_ENVIO = Object.freeze({
  estandar: 'Estándar (remitente, destinatario y códigos)',
  destinatario: 'Destinatario grande (letra extra)',
})
// El QR de la etiqueta mide ~30 mm: alta corrección de error para llevar el logo.
export const QR_ETIQUETA_ENVIO = Object.freeze({ ancho: 400, margen: 2, nivel: 'H', mm: 30 })

export const METODOS_ENVIO = Object.freeze({
  DELIVERY: 'Delivery',
  ENCOMIENDA: 'Encomienda',
  RETIRO: 'Retiro en tienda',
})

const texto = (valor) => String(valor ?? '').trim()
const esc = (valor) => String(valor ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))

/** Delivery propio, encomienda/transportadora o retiro, según los datos del pedido. */
export function metodoEnvio(orden = {}) {
  if (texto(orden.shippingCarrier)) return 'ENCOMIENDA'
  const tipo = texto(orden.deliveryType || orden.entrega).toLowerCase()
  if (tipo.includes('encomienda') || tipo.includes('transportadora')) return 'ENCOMIENDA'
  if (tipo.includes('retiro') || tipo.includes('sucursal') || tipo.includes('pickup')) return 'RETIRO'
  return 'DELIVERY'
}

const direccionDe = (orden) => {
  const direcciones = Array.isArray(orden?.customer?.addresses) ? orden.customer.addresses : []
  return direcciones.find((fila) => fila?.isDefault) || direcciones[0] || null
}

/** Fecha corta dd/mm/aaaa en la zona horaria del negocio (Asunción). */
export function fechaEtiqueta(valor = new Date()) {
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(fecha)
  const dato = (tipo) => partes.find((parte) => parte.type === tipo)?.value || ''
  return `${dato('day')}/${dato('month')}/${dato('year')}`
}

const bultosValidos = (valor) => Math.max(1, Math.min(MAX_BULTOS, Math.floor(Number(valor)) || 1))

/**
 * Datos de UNA etiqueta (un bulto de un pedido).
 *
 * @param {object} orden pedido (API, fila de reparto o demo): customer, shippingAddress,
 *   shippingCarrier/Branch, deliveryType, deliveryNotes, totalPyg, payments, delivery.pendingPyg.
 * @param {object} [opciones]
 * @param {object} [opciones.empresa] salida de `datosEncabezado()` (`tenant`, `branch`).
 * @param {number} [opciones.bulto] número de bulto (1…).
 * @param {number} [opciones.bultos] total de bultos del pedido.
 * @param {string} [opciones.enlace] enlace público de seguimiento (el del QR).
 * @param {Date|string} [opciones.fecha]
 */
export function datosEtiquetaEnvio(orden = {}, { empresa = {}, bulto = 1, bultos = 1, enlace = '', fecha = new Date() } = {}) {
  const cliente = orden.customer || {}
  const direccion = direccionDe(orden)
  const lineaDireccion = texto(orden.shippingAddress) || texto(direccion?.address)
  const ciudad = [direccion?.city, direccion?.department].map(texto).filter(Boolean).join(', ')
  const referencia = texto(direccion?.notes) || texto(orden.deliveryNotes)
  const metodo = metodoEnvio(orden)
  const transportadora = [orden.shippingCarrier, orden.shippingBranch].map(texto).filter(Boolean).join(' · ')
  const total = bultosValidos(bultos)
  const numero = Math.min(total, bultosValidos(bulto))

  const totales = totalesPedido(orden)
  // En reparto, lo cobrado en la calle todavía sin verificar ya no se vuelve a cobrar.
  const saldo = Math.max(0, Number(orden.delivery?.pendingPyg ?? totales.pendiente) || 0)
  const tenant = empresa.tenant || {}
  const sucursal = empresa.branch || {}
  // La dirección de la sucursal que despacha manda; sin ella, la de la empresa.
  const remitenteDireccion = (texto(sucursal.address)
    ? [sucursal.address, sucursal.city || tenant.city]
    : [tenant.address, tenant.city]).map(texto).filter(Boolean).join(', ')

  return {
    pedido: codigoPedido(orden.orderNumber || orden.number || orden.codigo) || 'Pedido',
    remitente: {
      nombre: texto(tenant.name) || texto(empresa.razon),
      direccion: remitenteDireccion,
      telefono: texto(sucursal.phone) || texto(tenant.phone),
      ruc: texto(tenant.ruc),
    },
    destinatario: {
      nombre: texto(cliente.name || cliente.nombre || orden.customerName) || 'Sin nombre',
      telefono: telefonoVisible(cliente.phone || cliente.telefono, cliente.countryCode),
      direccion: lineaDireccion,
      ciudad,
      referencia,
    },
    metodo,
    metodoRotulo: METODOS_ENVIO[metodo],
    transportadora: metodo === 'ENCOMIENDA' ? transportadora : '',
    bulto: numero,
    bultos: total,
    posicion: `${numero} de ${total}`,
    contraReembolso: saldo > 0,
    saldo,
    saldoTexto: saldo > 0 ? gs(saldo) : '',
    leyendaCobro: saldo > 0 ? 'CONTRA REEMBOLSO' : 'PAGADO',
    fecha: fechaEtiqueta(fecha),
    enlace: texto(enlace),
    codigoBarras: pedidoParaCodigo(orden),
  }
}

// El código de barras lleva el número de pedido tal como se muestra (AUR-0003).
function pedidoParaCodigo(orden) {
  return codigoPedido(orden.orderNumber || orden.number || orden.codigo) || texto(orden.id)
}

/**
 * Una etiqueta por bulto y por pedido, en orden. `bultos` = número fijo para
 * todos o `{ [idPedido]: n }`. Corta con error claro si el lote es excesivo.
 */
export function etiquetasDeEnvio(ordenes = [], { bultos = 1, ...resto } = {}) {
  const lista = (Array.isArray(ordenes) ? ordenes : [ordenes]).filter(Boolean)
  if (!lista.length) throw new Error('Elegí al menos un pedido para imprimir la etiqueta de envío.')
  const salida = []
  for (const orden of lista) {
    const cantidad = bultosValidos(typeof bultos === 'object' && bultos ? bultos[orden.id] : bultos)
    for (let n = 1; n <= cantidad; n += 1) salida.push({ orden, datos: datosEtiquetaEnvio(orden, { ...resto, bulto: n, bultos: cantidad }) })
  }
  if (salida.length > MAX_ETIQUETAS_ENVIO) throw new Error(`Se pueden imprimir hasta ${MAX_ETIQUETAS_ENVIO} etiquetas por vez; dividí la selección.`)
  return salida
}

/** Valores de la etiqueta para una plantilla posicionada (Impresión Pro, tipo `etiquetas-envio`). */
export function datosPlantillaEnvio(datos) {
  const d = datos.destinatario
  return {
    sender: [datos.remitente.nombre, datos.remitente.direccion, datos.remitente.telefono, datos.remitente.ruc ? `RUC ${datos.remitente.ruc}` : ''].filter(Boolean).join('\n'),
    recipient: [d.nombre, d.telefono].filter(Boolean).join('\n'),
    address: [d.direccion, d.ciudad, d.referencia ? `Ref.: ${d.referencia}` : ''].filter(Boolean).join('\n'),
    orderNumber: datos.pedido,
    method: [datos.metodoRotulo, datos.transportadora].filter(Boolean).join(' · '),
    packages: `BULTO ${datos.posicion}`,
    cod: datos.contraReembolso ? `CONTRA REEMBOLSO\nCOBRAR ${datos.saldoTexto}` : 'PAGADO',
    date: datos.fecha,
    barcode: datos.codigoBarras,
    qr: datos.enlace,
  }
}

const CSS = (variante) => {
  const grande = variante === 'destinatario'
  return `${PAGINA_CSS_ENVIO}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}`
    + '.etiqueta{position:relative;width:100mm;height:150mm;padding:3mm;overflow:hidden;page-break-after:always;break-after:page;display:flex;flex-direction:column;gap:1.6mm}'
    + '.etiqueta:last-child{page-break-after:auto;break-after:auto}'
    + '.remitente{display:flex;align-items:center;gap:2.5mm;border-bottom:.6mm solid #000;padding-bottom:1.6mm;min-height:13mm}'
    + '.remitente img{height:11mm;max-width:24mm;object-fit:contain;flex:none}'
    + '.remitente .datos{font-size:6.8pt;line-height:1.25;min-width:0}.remitente b{display:block;font-size:9pt}.rotulo{font-size:6.5pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase}'
    + `.destino{border:.8mm solid #000;padding:2.2mm 2.6mm;flex:1 1 auto;min-height:0;overflow:hidden}.destino .nombre{font-size:${grande ? 24 : 19}pt;font-weight:900;line-height:1.08;margin-top:.8mm;overflow-wrap:anywhere}`
    + `.destino .tel{font-size:${grande ? 17 : 14}pt;font-weight:800;margin-top:1.2mm}.destino .dir{font-size:${grande ? 14 : 11.5}pt;font-weight:700;line-height:1.2;margin-top:1.2mm;overflow-wrap:anywhere}`
    + `.destino .ciudad{font-size:${grande ? 13 : 11}pt;font-weight:800;margin-top:.8mm}.destino .ref{font-size:${grande ? 10.5 : 9}pt;margin-top:1.2mm;line-height:1.2}`
    + '.fila{display:flex;gap:2mm;align-items:stretch}.pedido{flex:1;border:.6mm solid #000;padding:1.4mm 2mm}.pedido .num{font-size:24pt;font-weight:900;line-height:1;letter-spacing:.01em}'
    + '.bulto{flex:none;min-width:27mm;background:#000;color:#fff;text-align:center;padding:1.4mm 2mm;display:flex;flex-direction:column;justify-content:center}.bulto .rotulo{color:#fff}.bulto b{font-size:17pt;line-height:1.05}'
    + '.metodo{border:.6mm solid #000;padding:1.2mm 2mm;font-size:11pt;font-weight:900;text-transform:uppercase}.metodo small{display:block;font-size:8pt;font-weight:700;text-transform:none}'
    + '.cobro{text-align:center;padding:1.6mm 2mm;border:.9mm solid #000}.cobro.cod{background:#000;color:#fff}.cobro .rotulo{font-size:8.5pt}.cobro .monto{font-size:22pt;font-weight:900;line-height:1.05}.cobro.pagado .monto{font-size:20pt;letter-spacing:.1em}'
    + '.codigos{display:flex;align-items:center;gap:3mm;border-top:.6mm solid #000;padding-top:1.8mm}.qr{flex:none;width:30mm;height:30mm;display:block}.qr-vacio{flex:none;width:30mm;height:30mm;border:.4mm dashed #000;font-size:7pt;display:flex;align-items:center;justify-content:center;text-align:center}'
    + '.barras{flex:1;min-width:0;text-align:center}.barras svg{width:100%;height:16mm;display:block}.barras .valor{font-size:9pt;font-weight:800;letter-spacing:.08em;margin-top:.6mm}.pie{display:flex;justify-content:space-between;font-size:7pt;font-weight:700}'
}

/**
 * HTML imprimible de una o varias etiquetas, una por página de 100 × 150 mm.
 * Cada item: `{ datos, qrSrc, logoSrc, barrasSvg }` (los tres últimos ya
 * resueltos por quien arma el papel; sin ellos la etiqueta igual sale legible).
 */
export function htmlEtiquetasEnvio(items = [], { variante = 'estandar' } = {}) {
  const paginas = items.map(({ datos, qrSrc = '', logoSrc = '', barrasSvg = '' }) => {
    const r = datos.remitente
    const d = datos.destinatario
    const remitente = `<div class="remitente">${logoSrc ? `<img src="${esc(logoSrc)}" alt="">` : ''}<div class="datos"><span class="rotulo">Remitente</span><b>${esc(r.nombre || 'Tienda')}</b>${[r.direccion, r.telefono ? `Tel. ${r.telefono}` : '', r.ruc ? `RUC ${r.ruc}` : ''].filter(Boolean).map(esc).join(' · ')}</div></div>`
    const destino = `<div class="destino"><span class="rotulo">Destinatario</span><div class="nombre">${esc(d.nombre)}</div>${d.telefono ? `<div class="tel">${esc(d.telefono)}</div>` : ''}<div class="dir">${esc(d.direccion || 'Sin dirección registrada')}</div>${d.ciudad ? `<div class="ciudad">${esc(d.ciudad)}</div>` : ''}${d.referencia ? `<div class="ref">Ref.: ${esc(d.referencia)}</div>` : ''}</div>`
    const fila = `<div class="fila"><div class="pedido"><span class="rotulo">Pedido</span><div class="num">${esc(datos.pedido)}</div></div><div class="bulto"><span class="rotulo">Bulto</span><b>${esc(datos.posicion)}</b></div></div>`
    const metodo = `<div class="metodo">${esc(datos.metodoRotulo)}${datos.transportadora ? `<small>${esc(datos.transportadora)}</small>` : ''}</div>`
    const cobro = datos.contraReembolso
      ? `<div class="cobro cod"><div class="rotulo">Contra reembolso · cobrar</div><div class="monto">${esc(datos.saldoTexto)}</div></div>`
      : '<div class="cobro pagado"><div class="monto">PAGADO</div></div>'
    const qr = qrSrc ? `<img class="qr" src="${esc(qrSrc)}" alt="QR de seguimiento del pedido"${datos.enlace ? ` data-enlace="${esc(datos.enlace)}"` : ''}>` : '<div class="qr-vacio">QR no disponible</div>'
    const codigos = `<div class="codigos">${qr}<div class="barras">${barrasSvg}<div class="valor">${esc(datos.codigoBarras)}</div></div></div>`
    const pie = `<div class="pie"><span>${esc(datos.fecha)}</span><span>Escaneá el QR para el seguimiento</span></div>`
    return `<section class="etiqueta" data-pedido="${esc(datos.pedido)}" data-bulto="${esc(datos.posicion)}">${remitente}${destino}${fila}${metodo}${cobro}${codigos}${pie}</section>`
  })
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de envío 10×15 (${items.length})</title><style>${CSS(variante)}</style></head><body>${paginas.join('')}</body></html>`
}
