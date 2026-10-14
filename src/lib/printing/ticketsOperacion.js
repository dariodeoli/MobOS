// Tickets ESC/POS por tipo de operación (#426): devolución, cambio, recibo de
// regalo y tarjeta de regalo. Mismo orden y estilo que el comprobante de venta
// (encabezado compartido, cliente, detalle, total en línea gruesa y pie); solo
// cambian el tipo de documento y el cuerpo. Los importes nunca se recortan: si
// no entran junto al rótulo, bajan a su propia línea.
import { gs } from '../../utils/calculos.js'
import { crearTicket } from './escpos.js'
import { encabezadoTicket, pieTicket } from './encabezadoTicket.js'
import { importeGrande } from './tickets.js'

// Importe con signo visible: los negativos llevan «-» pegado (-Gs 1.500.000).
export const importeConSigno = (monto) => (Number(monto) < 0 ? `-${gs(Math.abs(monto))}` : gs(monto))

// Par «rótulo … importe» que nunca se recorta: si no entra en una línea, el
// importe baja a la siguiente alineado a la derecha.
function parSeguro(t, izquierda, derecha) {
  if (String(izquierda).length + String(derecha).length + 1 <= t.columnas) t.par(izquierda, derecha)
  else { t.texto(izquierda); t.par('', derecha) }
}

const empresaDe = (doc) => ({ tenant: doc.tenant, branch: doc.branch })

// Una línea de artículo: nombre en negrita y «cantidad x unitario … total»
// debajo (los negativos conservan el signo en el total).
function lineaItem(t, item) {
  t.negrita().texto(item.description).negrita(false)
  parSeguro(t, `  ${item.quantity} x ${gs(Math.abs(item.unitPricePyg))}`, importeConSigno(item.totalPyg))
  for (const serie of item.seriales || []) t.texto(`  IMEI/Serie ${serie}`)
}

// Total como en la venta: regla doble y el importe grande en su propia línea.
function totalGrande(t, rotulo, monto) {
  t.linea('=')
  importeGrande(t, rotulo, monto)
}

function cliente(t, doc) {
  if (doc.cliente) parSeguro(t, 'Cliente', doc.cliente)
}

export function ticketDevolucion(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezadoTicket(t, doc.titulo, { numero: doc.pedido, fecha: doc.fecha, empresa: empresaDe(doc) })
  cliente(t, doc)
  if (doc.motivo) t.texto(`Motivo: ${doc.motivo}`)
  t.linea()
  t.par('Detalle', 'Importe')
  for (const item of doc.items) lineaItem(t, item)
  t.linea()
  totalGrande(t, 'Total reembolsado', importeConSigno(doc.totalReembolsoPyg))
  t.linea()
  t.texto('Reembolso')
  for (const metodo of doc.metodos) parSeguro(t, metodo.label, importeConSigno(metodo.amountPyg))
  pieTicket(t, { empresa: empresaDe(doc) })
  return t.avanza(2).corte()
}

export function ticketCambio(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezadoTicket(t, doc.titulo, { numero: doc.pedido, fecha: doc.fecha, empresa: empresaDe(doc) })
  cliente(t, doc)
  if (doc.motivo) t.texto(`Motivo: ${doc.motivo}`)
  t.linea()
  t.texto('DEVUELTOS')
  for (const item of doc.devueltos) lineaItem(t, item)
  parSeguro(t, 'Subtotal devueltos', importeConSigno(doc.subtotalDevueltosPyg))
  t.linea()
  t.texto('NUEVOS')
  if (!doc.nuevos.length) t.texto('  Sin artículos nuevos')
  for (const item of doc.nuevos) lineaItem(t, item)
  parSeguro(t, 'Subtotal nuevos', importeConSigno(doc.subtotalNuevosPyg))
  totalGrande(t, doc.rotuloTotal === 'Sin diferencia' ? 'Sin diferencia' : `Total ${doc.rotuloTotal.toLowerCase()}`, gs(doc.totalCambioPyg))
  if (doc.medio) {
    t.linea()
    t.texto(doc.direccion === 'cobrar' ? 'Pago' : 'Reembolso')
    parSeguro(t, doc.medio, gs(doc.totalCambioPyg))
  }
  pieTicket(t, { empresa: empresaDe(doc) })
  return t.avanza(2).corte()
}

// Recibo de regalo: sin un solo importe, cliente, pago ni IMEI.
export function ticketRegalo(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezadoTicket(t, doc.titulo, { numero: doc.pedido, fecha: doc.fecha, empresa: empresaDe(doc) })
  t.par('Artículo', 'Cant.')
  for (const item of doc.items) {
    const cantidad = String(item.quantity)
    const nombre = String(item.description)
    if (nombre.length + cantidad.length + 1 <= t.columnas) t.par(nombre, cantidad)
    else { t.texto(nombre); t.par('', cantidad) }
  }
  t.linea()
  t.texto('Cambios')
  t.texto(doc.politica)
  pieTicket(t, { empresa: empresaDe(doc) })
  return t.avanza(2).corte()
}

export function ticketTarjetaRegalo(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezadoTicket(t, doc.titulo, { fecha: doc.fecha, empresa: empresaDe(doc) })
  t.par('Código', doc.codigoEnmascaradoTicket)
  t.par('Vigencia', doc.vigencia.replace('Válida hasta el ', ''))
  totalGrande(t, 'Saldo', gs(doc.montoPyg))
  if (doc.qr) {
    t.avanza(1)
    t.qr(doc.qr, { tamano: ancho >= 80 ? 7 : 6, etiqueta: 'Escaneá para canjear' })
  }
  t.avanza(1)
  t.texto('Guardá esta tarjeta: quien tenga el código puede usar el saldo.')
  pieTicket(t, { empresa: empresaDe(doc) })
  return t.avanza(2).corte()
}
