// Cronología de un pedido de la demo: se DERIVA de la propia venta (creación,
// pagos, cambios de entrega, preparación, anulación), así nunca contradice los
// totales, los pagos ni el estado que muestra el pedido. Puro y sin storage.
// Eventos con la forma del API real (`/api/orders/:id/history`), más reciente
// primero: `{ id, type: created|payment|audit|comment, at, user, ... }`.
import { metodoDeMedio } from '../../utils/mediosPago.js'

const MIN = 60000
const SECUENCIA = {
  RETIRO: ['PROCESSING', 'READY_FOR_PICKUP', 'PICKED_UP'],
  DELIVERY: ['PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
}
// Demora nominal de cada paso respecto de la creación (minutos).
const DEMORA = {
  RETIRO: [3, 25, 70],
  DELIVERY: [3, 90, 240, 1500],
}
const CAJERA = { id: 'demo-user-cajera', name: 'María Benítez' }
const GERENTE = { id: 'demo-user-gerente', name: 'Ana Giménez' }
const REPARTIDOR = { id: 'demo-user-repartidor', name: 'Marcos Aquino' }
const usuarioDe = (venta) => ({ id: venta.seller?.id || venta.vendedorId || venta.sellerId || 'demo-user', name: venta.seller?.name || venta.sellerName || 'Equipo demo' })
const aMs = (valor) => { const t = new Date(valor).getTime(); return Number.isFinite(t) ? t : null }

/** Pasos de entrega (estado previo → nuevo) hasta el estado actual del pedido. */
export function pasosDeEntrega(tipo, estadoActual) {
  const secuencia = SECUENCIA[tipo === 'DELIVERY' ? 'DELIVERY' : 'RETIRO']
  const indice = secuencia.indexOf(estadoActual)
  const hasta = indice === -1 ? secuencia.length - 1 : indice
  return secuencia.slice(0, hasta + 1).map((estado, i) => ({ previo: i === 0 ? 'PENDING' : secuencia[i - 1], actual: estado, indice: i }))
}

export function eventosPedidoDemo(orden = {}, ahora = new Date()) {
  const tope = ahora.getTime()
  const creado = Math.min(tope, aMs(orden.creadoEn || orden.createdAt || orden.date || orden.fecha) ?? tope)
  const id = orden.id || 'demo-pedido'
  const tipo = String(orden.deliveryType || '').toUpperCase() === 'DELIVERY' ? 'DELIVERY' : 'RETIRO'
  const vendedor = usuarioDe(orden)
  const anulado = orden.status === 'CANCELLED' || orden.anulada === true
  const eventos = []
  const poner = (evento, secuencia = 0) => eventos.push({ ...evento, at: new Date(Math.min(tope, evento.t)).toISOString(), _orden: secuencia })

  poner({ id: `${id}-creado`, type: 'created', t: creado, user: vendedor }, 0)
  const nota = orden.observacion || orden.notes
  if (nota) poner({ id: `${id}-nota`, type: 'comment', t: creado + MIN, user: vendedor, body: nota, photos: [] }, 1)

  const seriales = (orden.items || []).flatMap((item) => item.serials || item.seriales || [])
  if (seriales.length) poner({ id: `${id}-imei`, type: 'audit', action: 'INVENTORY_UNITS_SOLD', t: creado + 2 * MIN, user: vendedor, metadata: { serials: seriales } }, 2)
  if (Number(orden.creditDays) > 0) poner({ id: `${id}-credito`, type: 'audit', action: 'ORDER_CREDIT_AUTHORIZED', t: creado + 3 * MIN, user: GERENTE, metadata: { approverName: GERENTE.name, via: 'PIN', overPyg: 0 } }, 3)

  // Pagos: el primero lo cobra quien vendió; los posteriores (cuotas, saldos) los cobra la cajera.
  const pagos = [...(orden.pagos || orden.payments || [])].map((p, i) => ({ ...p, t: aMs(p.fecha || p.paidAt || p.createdAt) ?? creado, i })).sort((a, b) => a.t - b.t)
  pagos.forEach((p, i) => {
    const monto = Number(p.monto ?? p.amountPyg) || 0
    if (!monto) return
    const tardio = p.t - creado > 6 * 3600000
    poner({
      id: `${id}-pago-${p.id || i}`, type: 'payment', t: Math.max(creado + 4 * MIN, p.t), user: tardio ? CAJERA : vendedor,
      payment: { method: metodoDeMedio(p.medioPago || p.method), amountPyg: monto, status: 'CONFIRMED', accountSnapshot: p.cuenta ? { name: p.cuenta } : null, reference: tardio ? 'Cobro de saldo / cuota' : '' },
    }, 4 + i)
  })

  // Entrega: cada cambio de estado hasta el actual, espaciado sin pasar de «ahora».
  const demoras = DEMORA[tipo]
  const pasos = pasosDeEntrega(tipo, anulado ? 'PROCESSING' : orden.fulfillmentStatus)
  const disponible = Math.max(MIN, tope - creado)
  pasos.forEach((paso) => {
    const t = creado + Math.min(demoras[paso.indice] * MIN, Math.round((disponible * (paso.indice + 1)) / (pasos.length + 1)))
    const quien = tipo === 'DELIVERY' && paso.indice >= 2 ? REPARTIDOR : vendedor
    poner({ id: `${id}-entrega-${paso.actual}`, type: 'audit', action: 'ORDER_FULFILLMENT_UPDATED', t, user: quien, metadata: { previous: paso.previo, current: paso.actual } }, 10 + paso.indice)
    if ((paso.actual === 'READY_FOR_PICKUP' || paso.actual === 'IN_TRANSIT') && !anulado) {
      poner({ id: `${id}-aviso-${paso.actual}`, type: 'audit', action: 'ORDER_NOTIFIED_WHATSAPP', t: t + 2 * MIN, user: vendedor, metadata: {} }, 10 + paso.indice + 0.5)
    }
  })
  const ultimo = eventos.reduce((max, e) => Math.max(max, new Date(e.at).getTime()), creado)
  if (anulado) {
    const unidades = (orden.items || []).reduce((suma, item) => suma + (Number(item.quantity ?? item.cantidad) || 1), 0)
    poner({ id: `${id}-anulado`, type: 'audit', action: 'ORDER_VOIDED', t: Math.max(ultimo + 5 * MIN, creado + 40 * MIN), user: GERENTE, metadata: { reason: String(orden.observacion || orden.notes || '').replace(/^Anulado:\s*/i, '') || 'Pedido anulado por la gerencia', restoredUnits: unidades } }, 99)
  }
  return eventos
    .sort((a, b) => new Date(b.at) - new Date(a.at) || b._orden - a._orden)
    .map(({ _orden, t, ...resto }) => resto)
}
