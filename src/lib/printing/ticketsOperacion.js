// Tickets ESC/POS por tipo de operación (#426): devolución, cambio, recibo de
// regalo y tarjeta de regalo. Mismo orden y estilo que el comprobante de venta
// (encabezado compartido, cliente, detalle, total en línea gruesa y pie); solo
// cambian el tipo de documento y el cuerpo. Los importes nunca se recortan: si
// no entran junto al rótulo, bajan a su propia línea.
import { gs } from '../../utils/calculos.js'
import { crearTicket } from './escpos.js'
import { encabezadoTicket, pieTicket } from './encabezadoTicket.js'
import { importeGrande } from './tickets.js'
import { clienteTicket, parSeguro, pedidoTicket, pieDocumentoTicket } from './bloquesDocumento.js'

// Importe con signo visible: los negativos llevan «-» pegado (-Gs 1.500.000).
export const importeConSigno = (monto) => (Number(monto) < 0 ? `-${gs(Math.abs(monto))}` : gs(monto))

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

// CLIENTE completo y PEDIDO, como en el comprobante de venta.
function bloquesCliente(t, doc, extra = []) {
  clienteTicket(t, doc.clienteDatos || doc.cliente)
  pedidoTicket(t, doc.orden || {}, extra)
}

// GARANTÍA Y CONDICIONES (política de cambios) y el QR con el enlace público.
const pieOperacion = (t, doc) => pieDocumentoTicket(t, { condiciones: doc.politica, enlace: doc.enlace })

export function ticketDevolucion(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezadoTicket(t, doc.titulo, { numero: doc.pedido, fecha: doc.fecha, empresa: empresaDe(doc) })
  bloquesCliente(t, doc, [doc.motivo ? `Motivo: ${doc.motivo}` : ''])
  t.par('Detalle', 'Importe')
  for (const item of doc.items) lineaItem(t, item)
  t.linea()
  totalGrande(t, 'Total reembolsado', importeConSigno(doc.totalReembolsoPyg))
  t.linea()
  t.texto('Reembolso')
  for (const metodo of doc.metodos) parSeguro(t, metodo.label, importeConSigno(metodo.amountPyg))
  pieOperacion(t, doc)
  pieTicket(t, { empresa: empresaDe(doc) })
  return t.avanza(2).corte()
}

export function ticketCambio(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezadoTicket(t, doc.titulo, { numero: doc.pedido, fecha: doc.fecha, empresa: empresaDe(doc) })
  bloquesCliente(t, doc, [doc.motivo ? `Motivo: ${doc.motivo}` : ''])
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
  pieOperacion(t, doc)
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
  pieOperacion(t, doc)
  pieTicket(t, { empresa: empresaDe(doc) })
  return t.avanza(2).corte()
}

export function ticketTarjetaRegalo(doc, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  encabezadoTicket(t, doc.titulo, { fecha: doc.fecha, empresa: empresaDe(doc) })
  t.par('Código', doc.codigoEnmascaradoTicket)
  t.par('Vigencia', doc.vigencia.replace('Válida hasta el ', ''))
  totalGrande(t, 'Saldo', gs(doc.montoPyg))
  pieDocumentoTicket(t, { condiciones: 'Guardá esta tarjeta: quien tenga el código puede usar el saldo. Se canjea en el cobro de la tienda.', qr: doc.qr, rotuloQr: 'Escaneá para canjear' })
  pieTicket(t, { empresa: empresaDe(doc) })
  return t.avanza(2).corte()
}
