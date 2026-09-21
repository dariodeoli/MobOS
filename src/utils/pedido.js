// Código de pedido para mostrar: los `PREFIX-#0001` se ven tal como se guardan
// (`MOB-#0001`; 4 dígitos mínimos, crece); cualquier otro formato
// (E2E-SEED-001…) se muestra tal cual. No cambia el valor guardado ni los
// enlaces.
export function codigoPedido(orderNumber) {
  const value = String(orderNumber ?? '').trim()
  const match = value.match(/^([A-Z]{2,3})[- ]?#?(\d+)$/)
  return match ? `${match[1]}-#${String(match[2]).padStart(4, '0')}` : value
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Fecha compacta del listado: "17 sep · 15:30", en 24 h y con el mes corto en
// minúsculas (independiente del locale del equipo). Sin fecha válida devuelve
// el texto vacío para que la celda no muestre "Invalid Date".
export function fechaCompacta(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  const dia = String(date.getDate()).padStart(2, '0')
  const hora = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${dia} ${MESES_CORTOS[date.getMonth()]} · ${hora}`
}

// Totales de un pedido en cualquiera de las dos formas que circulan por la app:
// API (payments con status + totalPyg) y local/demo (totalPagado + total). Lo
// usan el comprobante impreso y la vista digital del cliente para que el saldo
// que ve el cliente sea exactamente el que se imprimió.
// Fecha del listado con la etiqueta relativa que usa el mostrador: "Hoy 15:30",
// "Ayer 15:30", "Anteayer 15:30" y, más atrás, la fecha compacta normal.
export function fechaLegible(value) {
  if (!value) return 'Sin fecha'
  const fecha = new Date(value)
  if (Number.isNaN(fecha.getTime())) return 'Sin fecha'
  const hora = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`
  // Comparación por día local (parsear "YYYY-MM-DD" daría medianoche UTC).
  const [anio, mes, dia] = fechaClaveHoy().split('-').map(Number)
  const inicioHoy = new Date(anio, mes - 1, dia).getTime()
  const inicioFila = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime()
  const dias = Math.round((inicioHoy - inicioFila) / 86400000)
  if (dias === 0) return `Hoy ${hora}`
  if (dias === 1) return `Ayer ${hora}`
  if (dias === 2) return `Anteayer ${hora}`
  return fechaCompacta(fecha)
}

const fechaClaveHoy = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

export function totalesPedido(order) {
  const total = Number(order?.totalPyg ?? order?.total ?? 0)
  const pagos = Array.isArray(order?.payments) ? order.payments : Array.isArray(order?.pagos) ? order.pagos : []
  const confirmados = pagos.filter(pago => pago?.status === 'CONFIRMED' || pago?.status === undefined)
  const pagado = confirmados.length
    ? confirmados.reduce((suma, pago) => suma + Number(pago.amountPyg ?? pago.monto ?? 0), 0)
    : Number(order?.totalPagado ?? order?.paidPyg ?? 0)
  return { total, pagado, pendiente: Math.max(0, total - pagado) }
}
