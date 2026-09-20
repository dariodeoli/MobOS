// Números del cierre de caja, compartidos por la pantalla (Caja.jsx) y el
// papel (ticket y HTML): una sola fuente para que el cierre impreso coincida
// con lo que se ve. Sin dependencias del navegador para poder testearlo.
import { ETIQUETAS_MEDIO_PAGO } from '../lib/constants.js'
import { num } from './calculos.js'

const etiquetaMedio = (method) => ETIQUETAS_MEDIO_PAGO[method] || method || 'Otro'

// Cobros por medio de pago que devuelve la auditoría de caja del backend
// (`/api/cash/audit`: { method, amountPyg, count }).
export function cobrosDeAuditoria(methods = []) {
  return (Array.isArray(methods) ? methods : [])
    .map((fila) => ({
      method: fila?.method || 'OTRO',
      label: etiquetaMedio(fila?.method),
      montoPyg: num(fila?.amountPyg),
      count: num(fila?.count),
    }))
    .filter((fila) => fila.montoPyg > 0 || fila.count > 0)
    .sort((a, b) => b.montoPyg - a.montoPyg)
}

// Cobros por medio de pago de ventas locales/demo (pagos con medioPago/monto).
export function cobrosDePagos(pagos = []) {
  const porMedio = new Map()
  for (const pago of Array.isArray(pagos) ? pagos : []) {
    const crudo = pago?.method || pago?.medioPago || ''
    const method = String(crudo).toUpperCase() === 'DINERO' ? 'CASH' : String(crudo || 'OTRO')
    const fila = porMedio.get(method) || { method, label: etiquetaMedio(method), montoPyg: 0, count: 0 }
    fila.montoPyg += num(pago?.amountPyg ?? pago?.monto)
    fila.count += 1
    porMedio.set(method, fila)
  }
  return [...porMedio.values()]
    .filter((fila) => fila.montoPyg > 0 || fila.count > 0)
    .sort((a, b) => b.montoPyg - a.montoPyg)
}

// Normaliza un movimiento de caja para el papel.
const movimientoEnPapel = (movimiento) => ({
  id: movimiento?.id || '',
  fecha: movimiento?.createdAt || movimiento?.fecha || null,
  descripcion: movimiento?.description || movimiento?.motivo || movimiento?.kind || 'Movimiento',
  direccion: movimiento?.direction || 'OUT',
  montoPyg: Math.abs(num(movimiento?.amountPyg ?? movimiento?.monto)),
  cuenta: movimiento?.account?.name || movimiento?.cuenta || '',
})

// Cierre de caja: toma la sesión tal como la devuelve la pantalla y los
// movimientos de la sesión (openedAt..closedAt). `cobros` llega ya normalizado
// (medios de pago); `apertura`/`esperado`/`contado`/`diferencia` son los mismos
// valores que muestra Caja.jsx.
export function armarCierreCaja({ cash = {}, movimientos = [], cobros = [], empresa = '', sucursal = '', usuario = '' } = {}) {
  const apertura = num(cash?.openingPyg)
  const esperado = num(cash?.expectedPyg ?? cash?.openingPyg)
  const contado = cash?.countedPyg == null ? null : num(cash?.countedPyg)
  const diferencia = cash?.differencePyg != null ? num(cash?.differencePyg) : contado == null ? null : contado - esperado
  const abiertoEn = cash?.openedAt || null
  const cerradoEn = cash?.closedAt || null
  const desde = abiertoEn ? new Date(abiertoEn).getTime() : null
  const hasta = cerradoEn ? new Date(cerradoEn).getTime() : null
  const deLaSesion = (Array.isArray(movimientos) ? movimientos : [])
    .filter((movimiento) => {
      const cuando = new Date(movimiento?.createdAt || movimiento?.fecha || 0).getTime()
      if (!cuando) return false
      if (desde && cuando < desde) return false
      if (hasta && cuando > hasta) return false
      return true
    })
    .map(movimientoEnPapel)
    .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0))
  const listaCobros = Array.isArray(cobros) ? cobros : []
  return {
    empresa,
    sucursal,
    usuario,
    estado: cash?.status || 'OPEN',
    abiertoEn,
    cerradoEn,
    notas: cash?.notes || '',
    apertura,
    esperado,
    contado,
    diferencia,
    movimientos: deLaSesion,
    ingresos: deLaSesion.filter((movimiento) => movimiento.direccion === 'IN').reduce((total, movimiento) => total + movimiento.montoPyg, 0),
    egresos: deLaSesion.filter((movimiento) => movimiento.direccion === 'OUT').reduce((total, movimiento) => total + movimiento.montoPyg, 0),
    cobros: listaCobros,
    totalCobros: listaCobros.reduce((total, cobro) => total + num(cobro.montoPyg), 0),
    cobrosFecha: cash?.openedAt || null,
  }
}
