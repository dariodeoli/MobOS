// Tickets ESC/POS por tipo de operación (#426): devolución, cambio, recibo de
// regalo y tarjeta de regalo. Mismo contenido que el HTML (`operacionHtml.js`),
// en la térmica de 58 o 80 mm. Los importes nunca se recortan: si no entran
// junto al rótulo, bajan a su propia línea.
import { gs } from '../../utils/calculos.js'
import { APP_NAME } from '../brand.js'
import { crearTicket } from './escpos.js'
import { importeGrande } from './tickets.js'

const fechaHora = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '')
const NO_FISCAL = 'Documento no fiscal.'

// Importe con signo visible: los negativos llevan «-» pegado (Gs -1.500.000).
export const importeConSigno = (monto) => (Number(monto) < 0 ? `-${gs(Math.abs(monto))}` : gs(monto))

// Par «rótulo … importe» que nunca se recorta: si no entra en una línea, el
// importe baja a la siguiente alineado a la derecha.
function parSeguro(t, izquierda, derecha) {
  if (String(izquierda).length + String(derecha).length + 1 <= t.columnas) t.par(izquierda, derecha)
  else { t.texto(izquierda); t.par('', derecha) }
}

function encabezado(t, doc, titulo) {
  t.negrita().centrado(doc.empresa || APP_NAME).negrita(false)
  if (doc.ruc) t.centrado(`RUC ${doc.ruc}`)
  if (doc.sucursal) t.centrado(doc.sucursal)
  if (doc.sucursalDireccion) t.centrado(doc.sucursalDireccion)
  if (doc.telefono) t.centrado(`Tel. ${doc.telefono}`)
  t.linea('=')
  t.negrita().centrado(titulo).negrita(false)
  if (doc.pedido) t.centrado(`Pedido ${doc.pedido}`)
  if (doc.fecha) t.centrado(fechaHora(doc.fecha))
  t.linea()
}

// Una línea de artículo: nombre en negrita y «cantidad x unitario … total»
// debajo (los negativos conservan el signo).
function lineaItem(t, item) {
  t.negrita().texto(item.description).negrita(false)
  const detalle = `  ${item.quantity} x ${importeConSigno(item.unitPricePyg)}`
  parSeguro(t, detalle, importeConSigno(item.totalPyg))
  for (const serie of item.seriales || []) t.texto(`  IMEI/Serie ${serie}`)
}

function cierre(t, doc) {
  t.linea()
  t.centrado(`${NO_FISCAL} Generado por ${APP_NAME}${doc.empresa ? ` para ${String(doc.empresa).replace(/\.$/, '')}` : ''}.`)
  return t.avanza(2).corte()
}

export function ticketDevolucion(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezado(t, doc, doc.titulo)
  if (doc.cliente) parSeguro(t, 'Cliente', doc.cliente)
  t.par('Detalle', 'Importe')
  for (const item of doc.items) lineaItem(t, item)
  if (doc.motivo) { t.linea(); t.texto(`Motivo: ${doc.motivo}`) }
  t.linea()
  t.texto('Reembolso')
  for (const metodo of doc.metodos) parSeguro(t, metodo.label, importeConSigno(metodo.amountPyg))
  t.linea('=')
  importeGrande(t, 'TOTAL REEMBOLSADO', importeConSigno(doc.totalReembolsoPyg))
  t.linea('=')
  return cierre(t, doc)
}

export function ticketCambio(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezado(t, doc, doc.titulo)
  if (doc.cliente) parSeguro(t, 'Cliente', doc.cliente)
  t.negrita().texto('DEVUELTOS').negrita(false)
  for (const item of doc.devueltos) lineaItem(t, item)
  parSeguro(t, 'Subtotal devueltos', importeConSigno(doc.subtotalDevueltosPyg))
  t.linea()
  t.negrita().texto('NUEVOS').negrita(false)
  if (!doc.nuevos.length) t.texto('  Sin artículos nuevos')
  for (const item of doc.nuevos) lineaItem(t, item)
  parSeguro(t, 'Subtotal nuevos', importeConSigno(doc.subtotalNuevosPyg))
  if (doc.motivo) { t.linea(); t.texto(`Motivo: ${doc.motivo}`) }
  t.linea('=')
  t.negrita().texto('TOTAL DE CAMBIOS').negrita(false)
  importeGrande(t, doc.rotuloTotal.toUpperCase(), gs(doc.totalCambioPyg))
  if (doc.medio) parSeguro(t, doc.direccion === 'cobrar' ? 'Medio de pago' : 'Medio de reembolso', doc.medio)
  t.linea('=')
  return cierre(t, doc)
}

// Recibo de regalo: sin un solo importe, cliente, pago ni IMEI.
export function ticketRegalo(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezado(t, doc, doc.titulo)
  t.par('Artículo', 'Cant.')
  for (const item of doc.items) {
    const cantidad = String(item.quantity)
    const nombre = String(item.description)
    if (nombre.length + cantidad.length + 1 <= t.columnas) t.par(nombre, cantidad)
    else { t.texto(nombre); t.par('', cantidad) }
  }
  t.linea()
  t.texto(doc.politica)
  t.linea()
  t.centrado(`${NO_FISCAL} Generado por ${APP_NAME}${doc.empresa ? ` para ${String(doc.empresa).replace(/\.$/, '')}` : ''}.`)
  return t.avanza(2).corte()
}

export function ticketTarjetaRegalo(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  t.negrita().centrado(doc.empresa || APP_NAME).negrita(false)
  if (doc.sucursal) t.centrado(doc.sucursal)
  t.linea('=')
  t.negrita().centrado(doc.titulo).negrita(false)
  t.linea('=')
  importeGrande(t, '', gs(doc.montoPyg))
  t.linea('=')
  if (doc.qr) {
    t.avanza(1)
    t.qr(doc.qr, { tamano: ancho >= 80 ? 7 : 6, etiqueta: 'Escaneá para canjear' })
  }
  t.avanza(1)
  t.centrado(doc.codigoEnmascaradoTicket)
  t.centrado(doc.vigencia)
  t.linea()
  t.centrado(`${NO_FISCAL} Guardá esta tarjeta: el código es el saldo. Generado por ${APP_NAME}.`)
  return t.avanza(2).corte()
}
