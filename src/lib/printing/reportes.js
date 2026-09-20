// Reportes imprimibles en ESC/POS (58/80 mm): cierre de caja y resumen del
// día. Los números llegan ya calculados por las mismas funciones que usa la
// pantalla (`armarCierreCaja`, `armarResumenDia`): acá solo se les da formato
// de papel, igual que los comprobantes de tickets.js.
import { gs } from '../../utils/calculos.js'
import { APP_NAME } from '../brand.js'
import { crearTicket } from './escpos.js'

const fecha = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const fechaCorta = (valor) => (valor ? new Date(valor).toLocaleDateString('es-PY') : '')
const conSigno = (monto, direccion) => `${direccion === 'OUT' ? '- ' : '+ '}${gs(Math.abs(Number(monto) || 0))}`

// Cierre de caja: apertura, cobros por medio de pago, movimientos de la
// sesión, esperado/contado/diferencia y espacio de firma.
export function ticketCierreCaja(cierre = {}, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const movimientos = Array.isArray(cierre.movimientos) ? cierre.movimientos : []
  const cobros = Array.isArray(cierre.cobros) ? cierre.cobros : []
  const cerrada = cierre.estado === 'CLOSED'

  t.centrado(cierre.empresa || APP_NAME).negrita().centrado('CIERRE DE CAJA').negrita(false)
  t.centrado(cierre.sucursal || '')
  t.centrado(`${cerrada ? 'Cierre' : 'Apertura'}: ${fecha(cierre.abiertoEn)}`)
  t.linea()
  if (cierre.usuario) t.par('Generado por', cierre.usuario)
  if (cerrada) t.par('Cerrada', fecha(cierre.cerradoEn))
  t.linea()

  t.par('Apertura', gs(cierre.apertura))
  t.par(`Cobros${cierre.cobrosFecha ? ` ${fechaCorta(cierre.cobrosFecha)}` : ''}`, gs(cierre.totalCobros))
  if (cierre.ingresos) t.par('Movimientos (entradas)', gs(cierre.ingresos))
  if (cierre.egresos) t.par('Movimientos (salidas)', `- ${gs(cierre.egresos)}`)
  t.doble().par('ESPERADO', gs(cierre.esperado)).doble(false)
  if (cerrada) {
    t.par('Contado', gs(cierre.contado))
    t.negrita().doble().par('DIFERENCIA', gs(cierre.diferencia)).doble(false).negrita(false)
  } else {
    t.par('Contado', 'se completa al cerrar')
  }

  t.linea()
  t.negrita().texto(`Movimientos de la sesión (${movimientos.length})`).negrita(false)
  for (const movimiento of movimientos) {
    t.texto(movimiento.descripcion || 'Movimiento')
    const detalle = [movimiento.cuenta, fechaCorta(movimiento.fecha)].filter(Boolean).join(' · ')
    if (detalle) t.texto(`  ${detalle}`)
    t.par('  ', conSigno(movimiento.montoPyg, movimiento.direccion))
  }
  if (!movimientos.length) t.texto('Sin movimientos registrados.')

  t.linea()
  t.negrita().texto(`Cobros por medio de pago (${cobros.length})`).negrita(false)
  for (const cobro of cobros) {
    t.par(`${cobro.label}${cobro.count ? ` x${cobro.count}` : ''}`, gs(cobro.montoPyg))
  }
  if (!cobros.length) t.texto('Sin cobros para el período.')
  t.par('TOTAL COBRADO', gs(cierre.totalCobros))

  if (cierre.notas) {
    t.linea()
    t.texto(`Notas: ${cierre.notas}`)
  }
  t.linea()
  t.avanza(2)
  t.texto('Firma del responsable: ______________________')
  t.avanza(2)
  t.texto('Firma de control: __________________________')
  return t.avanza(2).corte()
}

// Resumen del día (o del rango activo): ventas, ticket promedio, productos más
// vendidos, cobrado y pendiente, con los medios de pago usados.
export function ticketResumenDia(resumen = {}, { ancho = 80 } = {}) {
  const t = crearTicket({ ancho }).iniciar()
  const top = Array.isArray(resumen.topProductos) ? resumen.topProductos : []
  const medios = Array.isArray(resumen.medios) ? resumen.medios : []

  t.centrado(resumen.empresa || APP_NAME).negrita().centrado('RESUMEN DEL DÍA').negrita(false)
  t.centrado(resumen.etiqueta || `${fechaCorta(resumen.rango?.desde)} a ${fechaCorta(resumen.rango?.hasta)}`)
  t.linea()
  t.par('Ventas', String(resumen.ventas ?? 0))
  t.doble().par('FACTURADO', gs(resumen.total)).doble(false)
  t.par('Ticket promedio', gs(resumen.ticket))
  t.par('Cobrado', gs(resumen.cobrado))
  t.par('Pendiente', gs(resumen.pendiente))
  if (resumen.comision) t.par('Comisiones', gs(resumen.comision))
  if (resumen.gastos) t.par('Gastos', gs(resumen.gastos))
  t.linea()
  t.negrita().texto(`Productos más vendidos (${top.length})`).negrita(false)
  for (const producto of top) {
    t.texto(producto.nombre || 'Producto')
    t.par(`  x${producto.cantidad}`, gs(producto.montoPyg))
  }
  if (!top.length) t.texto('Sin ventas en el período.')

  if (medios.length) {
    t.linea()
    t.negrita().texto('Medios de pago').negrita(false)
    for (const medio of medios) t.par(medio.medio || '—', gs(medio.monto))
  }
  t.linea()
  t.centrado('Documento de control interno. No es comprobante fiscal.')
  return t.avanza(2).corte()
}
