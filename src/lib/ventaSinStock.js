// Venta sin stock · estado de lo vendido sobre pedido (espejo de
// backend/lib/backorder-status.ts). El servidor manda el estado ya calculado;
// este módulo da las etiquetas, los tonos, los pasos y —solo para la demo— el
// mismo cálculo local.

export const ESTADOS_SOBRE_PEDIDO = ['PENDIENTE_COMPRA', 'COMPRADO', 'EN_CAMINO', 'LLEGO', 'ENTREGADO']

export const ESTADO_LABEL = {
  PENDIENTE_COMPRA: 'Por comprar',
  COMPRADO: 'Comprado',
  EN_CAMINO: 'En camino',
  LLEGO: 'Llegó',
  ENTREGADO: 'Entregado',
}

export const ESTADO_TONO = {
  PENDIENTE_COMPRA: 'orange',
  COMPRADO: 'blue',
  EN_CAMINO: 'blue',
  LLEGO: 'green',
  ENTREGADO: 'slate',
}

// La única acción principal de cada fila.
export const PASO_LABEL = {
  COMPRAR: 'Comprar',
  CARGAR_COSTO: 'Cargar costo',
  MARCAR_PAGADO: 'Marcar pagado',
  RECIBIDO: 'Recibido',
  AVISAR: 'Avisar al cliente',
  ENTREGAR: 'Entregar',
}

const positivo = (valor) => Math.max(0, Math.round(Number(valor) || 0))

/** Mismo cálculo que el servidor (para la demo y las pruebas). */
export function estadoSobrePedido({ stockPending = 0, serialsPending = 0, backorderArrivedAt = null, need = null, shipmentStatus = null, entregado = false } = {}) {
  const pendientes = positivo(stockPending) + positivo(serialsPending)
  const llegada = Boolean(backorderArrivedAt) || Boolean(need?.arrivedAt) || need?.status === 'RECIBIDA'
  if (!(pendientes > 0 || llegada || need)) return null
  if (entregado && pendientes === 0) return 'ENTREGADO'
  if (llegada) return 'LLEGO'
  if (!need || need.status === 'CANCELADA') return 'PENDIENTE_COMPRA'
  if (positivo(need.quantity) > 0) return 'PENDIENTE_COMPRA'
  if (need.status === 'COMPRADA') return ['DESPACHADO', 'EN_TRANSITO', 'CON_INCIDENCIA', 'RECEPCION_PARCIAL'].includes(String(shipmentStatus || '')) ? 'EN_CAMINO' : 'COMPRADO'
  return 'PENDIENTE_COMPRA'
}

export function estadoDelPedido(estados) {
  const validos = (estados || []).filter(Boolean)
  if (!validos.length) return null
  return validos.reduce((atrasado, actual) => (ESTADOS_SOBRE_PEDIDO.indexOf(actual) < ESTADOS_SOBRE_PEDIDO.indexOf(atrasado) ? actual : atrasado))
}

export function siguientePaso({ estado, faltaCosto = false, pagado = false, credito = false, avisado = false } = {}) {
  switch (estado) {
    case 'PENDIENTE_COMPRA': return 'COMPRAR'
    case 'COMPRADO':
    case 'EN_CAMINO':
      if (faltaCosto) return 'CARGAR_COSTO'
      if (!pagado && !credito) return 'MARCAR_PAGADO'
      return 'RECIBIDO'
    case 'LLEGO': return avisado ? 'ENTREGAR' : 'AVISAR'
    default: return null
  }
}

export function fechaCorta(valor) {
  if (!valor) return null
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  return `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Frase para el cliente («Sobre pedido · llega aprox. 30/10» → «En camino» → «Listo para retirar» → «Entregado»). */
export function tituloParaCliente(estado, { fechaPrometida = null, mostrarFecha = true, entregaADomicilio = false } = {}) {
  const fecha = mostrarFecha ? fechaCorta(fechaPrometida) : null
  switch (estado) {
    case 'PENDIENTE_COMPRA':
    case 'COMPRADO': return fecha ? `Sobre pedido · llega aprox. ${fecha}` : 'Sobre pedido'
    case 'EN_CAMINO': return 'En camino'
    case 'LLEGO': return entregaADomicilio ? 'Listo para entregar' : 'Listo para retirar'
    case 'ENTREGADO': return 'Entregado'
    default: return ''
  }
}

/** Plazo de la fecha prometida: prioriza lo que vence antes (o ya venció). */
export function plazoPrometido(prometidaEl, ahora = Date.now()) {
  if (!prometidaEl) return null
  const fecha = new Date(prometidaEl)
  if (Number.isNaN(fecha.getTime())) return null
  const dias = Math.ceil((fecha.getTime() - ahora) / 86_400_000)
  if (dias < 0) return { vencida: true, texto: `vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`, tono: 'font-semibold text-bad' }
  if (dias === 0) return { vencida: false, texto: 'vence hoy', tono: 'font-semibold text-warn' }
  if (dias <= 3) return { vencida: false, texto: `vence en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'text-warn' }
  return { vencida: false, texto: `para el ${fechaCorta(prometidaEl)}`, tono: 'text-mute' }
}

/** Filtros del panel: por estado y «Sin costo». */
export const FILTROS_VENTAS = [
  ['todos', 'Todos'],
  ['PENDIENTE_COMPRA', 'Por comprar'],
  ['COMPRADO', 'Comprado'],
  ['EN_CAMINO', 'En camino'],
  ['LLEGO', 'Llegó'],
  ['sin-costo', 'Sin costo'],
]

export function filtrarVentas(lineas, filtro, busqueda = '') {
  const q = String(busqueda || '').trim().toLowerCase()
  return (lineas || []).filter((linea) => {
    if (filtro === 'sin-costo' ? !linea.faltaCosto : filtro !== 'todos' && linea.estado !== filtro) return false
    if (!q) return true
    return `${linea.producto || ''} ${linea.cliente || ''} ${linea.pedidoNumero || ''}`.toLowerCase().includes(q)
  })
}

export function contarVentas(lineas) {
  const cuenta = { todos: lineas.length, 'sin-costo': 0 }
  for (const estado of ESTADOS_SOBRE_PEDIDO) cuenta[estado] = 0
  for (const linea of lineas) {
    if (linea.estado) cuenta[linea.estado] += 1
    if (linea.faltaCosto) cuenta['sin-costo'] += 1
  }
  return cuenta
}
