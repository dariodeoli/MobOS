// Reparto demo (#324): pedidos asignados al repartidor ficticio, cobros en la
// calle y rendiciones, con la misma forma que `/api/delivery/*`. En memoria de
// la pestaña; las mutaciones (cobrar, marcar entregado, rendir, verificar)
// reproducen el flujo real sin tocar el servidor.
import { guardarDemo, leerDemo } from '../demoStorage.js'
import { getDemoTenant } from '../demoTenant.js'

const KEY = 'mobos:demo-delivery:v1'
const REPARTIDOR = 'demo-user-repartidor'
const BRANCH = 'mobos-demo-central'

const hace = (horas) => new Date(Date.now() - horas * 3600000).toISOString()

const pedido = ({ id, numero, cliente, telefono, direccion, items, total, confirmado, cobrado = 0, pendiente, fulfillment, assignedTo = REPARTIDOR, paymentId = null, paymentMethod = 'CASH', paymentReference = '' }) => ({
  id,
  orderNumber: numero,
  createdAt: hace(30),
  customer: { name: cliente, phone: telefono, countryCode: '+595', addresses: [{ address: direccion, city: 'Asunción', department: 'Capital', label: 'Casa' }] },
  items: items.map(([quantity, description]) => ({ quantity, description })),
  totalPyg: total,
  delivery: { confirmedPyg: confirmado, collectedPyg: cobrado, paidPyg: confirmado + cobrado, pendingPyg: pendiente },
  fulfillmentStatus: fulfillment,
  deliveryType: 'DELIVERY',
  deliveryNotes: 'Llamar al llegar.',
  notes: '',
  assignedToId: assignedTo,
  assignedTo: assignedTo ? { id: assignedTo, name: 'Marcos Aquino' } : null,
  payments: paymentId ? [{ id: paymentId, amountPyg: cobrado, method: paymentMethod, reference: paymentReference, status: 'PENDING', deliveryUserId: REPARTIDOR, collectedAt: hace(5) }] : [],
})

const seed = () => ({
  orders: [
    pedido({ id: 'demo-entrega-1', numero: 'AUR-0005', cliente: 'Juan Pereira', telefono: '0981222333', direccion: 'Av. Mcal. López 1234', items: [[1, 'iPhone 15 128GB Azul']], total: 4880000, confirmado: 2000000, pendiente: 2880000, fulfillment: 'IN_TRANSIT' }),
    pedido({ id: 'demo-entrega-2', numero: 'AUR-0008', cliente: 'Estela Ramírez', telefono: '0987999111', direccion: 'Calle Estela 112', items: [[1, 'iPhone 15 256GB Rosa']], total: 5430000, confirmado: 2000000, cobrado: 3430000, pendiente: 0, fulfillment: 'IN_TRANSIT', paymentId: 'demo-cobro-calle-1', paymentMethod: 'TRANSFER', paymentReference: 'Continental · 8871' }),
    pedido({ id: 'demo-entrega-3', numero: 'AUR-0011', cliente: 'Fernando Ortellado', telefono: '0973111444', direccion: 'Calle Fernando 132', items: [[1, 'iPhone 15 Pro 256GB Negro']], total: 6780000, confirmado: 6780000, pendiente: 0, fulfillment: 'DELIVERED' }),
    pedido({ id: 'demo-entrega-4', numero: 'AUR-0003', cliente: 'Lucía Franco', telefono: '0983666777', direccion: 'Calle Lucía 145', items: [[1, 'AirPods Pro 2 USB-C']], total: 1880000, confirmado: 0, pendiente: 1880000, fulfillment: 'PROCESSING', assignedTo: null }),
    pedido({ id: 'demo-entrega-5', numero: 'AUR-0012', cliente: 'Hugo Benítez', telefono: '0986555222', direccion: 'Calle Hugo 149', items: [[1, 'iPhone 12 128GB Verde']], total: 2350000, confirmado: 0, pendiente: 2350000, fulfillment: 'PROCESSING', assignedTo: null }),
  ],
  settlements: [
    {
      id: 'demo-rendicion-1', createdAt: hace(4), deliveryUserId: REPARTIDOR, deliveryUser: { id: REPARTIDOR, name: 'Marcos Aquino' },
      branch: { id: BRANCH, name: 'Casa Central' }, totalPyg: 3430000, pendingPyg: 0, ordersCount: 1, status: 'PENDING', note: 'Transferencia de Estela Ramírez.', verifiedBy: null, verifiedAt: null,
      payments: [{ id: 'demo-cobro-calle-1', amountPyg: 3430000, method: 'TRANSFER', reference: 'Continental · 8871', status: 'PENDING', collectedAt: hace(5), order: { id: 'demo-entrega-2', orderNumber: 'AUR-0008', totalPyg: 5430000, fulfillmentStatus: 'IN_TRANSIT', customer: { name: 'Estela Ramírez' } } }],
    },
  ],
})

function read() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    if (guardado && Array.isArray(guardado.orders) && Array.isArray(guardado.settlements)) return guardado
  } catch { /* se regenera */ }
  const fresh = seed()
  guardarDemo(KEY, JSON.stringify(fresh))
  return fresh
}
const write = (state) => { guardarDemo(KEY, JSON.stringify(state)); return state }

const activo = (order) => !['DELIVERED', 'PICKED_UP'].includes(order.fulfillmentStatus)

export function listDemoDeliveryOrders({ estado = '', asignado = '', assignedToId = '' } = {}) {
  const state = read()
  return state.orders.filter((order) => {
    if (estado === 'activos' && !activo(order)) return false
    if (estado === 'entregados' && activo(order)) return false
    if (asignado === 'sin-asignar' && order.assignedToId) return false
    if (asignado === 'asignados' && !order.assignedToId) return false
    if (assignedToId && order.assignedToId !== assignedToId) return false
    return true
  })
}

export function listDemoDeliverySettlements({ estado = '' } = {}) {
  const state = read()
  return state.settlements.filter((fila) => !estado || fila.status === estado)
}

export const REPARTIDOR_DEMO_ID = REPARTIDOR

/** Pedidos e historial del repartidor demo (el panel solo ve los suyos). */
export function listDemoDeliveryOrdersDelRepartidor(params = {}) {
  return listDemoDeliveryOrders({ ...params, assignedToId: REPARTIDOR })
}

export function listDemoDeliverySettlementsDelRepartidor(params = {}) {
  return listDemoDeliverySettlements(params)
}

export function registrarCobroRepartoDemo(orderId, { amountPyg = 0, method = 'CASH', reference = '' } = {}) {
  const state = read()
  const order = state.orders.find((fila) => fila.id === orderId)
  if (!order) throw new Error('Pedido de reparto no encontrado.')
  const monto = Math.max(0, Math.min(Number(amountPyg) || 0, Number(order.delivery?.pendingPyg || 0)))
  if (!monto) throw new Error('Ingresá un monto mayor a cero.')
  order.payments = [...(order.payments || []), { id: `demo-cobro-${Date.now().toString(36)}`, amountPyg: monto, method, reference, status: 'PENDING', deliveryUserId: REPARTIDOR, collectedAt: new Date().toISOString() }]
  order.delivery = { ...order.delivery, collectedPyg: Number(order.delivery?.collectedPyg || 0) + monto, paidPyg: Number(order.delivery?.paidPyg || 0) + monto, pendingPyg: Math.max(0, Number(order.delivery?.pendingPyg || 0) - monto) }
  write(state)
  return order
}

export function cambiarEstadoRepartoDemo(orderId, fulfillmentStatus) {
  const state = read()
  const order = state.orders.find((fila) => fila.id === orderId)
  if (!order) throw new Error('Pedido de reparto no encontrado.')
  order.fulfillmentStatus = fulfillmentStatus
  write(state)
  return order
}

export function asignarRepartoDemo(orderId, assignedToId) {
  const state = read()
  const order = state.orders.find((fila) => fila.id === orderId)
  if (!order) throw new Error('Pedido de reparto no encontrado.')
  order.assignedToId = assignedToId || null
  order.assignedTo = assignedToId ? { id: assignedToId, name: 'Marcos Aquino' } : null
  write(state)
  return order
}

export function crearRendicionDemo() {
  const state = read()
  const cobros = state.orders
    .flatMap((order) => (order.payments || []).filter((pago) => pago.status === 'PENDING' && pago.deliveryUserId).map((pago) => ({ pago, order })))
  if (!cobros.length) throw new Error('No hay cobros para rendir.')
  const total = cobros.reduce((suma, fila) => suma + Number(fila.pago.amountPyg || 0), 0)
  const pendiente = cobros.reduce((suma, fila) => suma + Number(fila.order.delivery?.pendingPyg || 0), 0)
  const rendicion = {
    id: `demo-rendicion-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    deliveryUserId: REPARTIDOR,
    deliveryUser: { id: REPARTIDOR, name: 'Marcos Aquino' },
    branch: { id: BRANCH, name: 'Casa Central' },
    totalPyg: total,
    pendingPyg: pendiente,
    ordersCount: new Set(cobros.map((fila) => fila.order.id)).size,
    status: 'PENDING',
    note: '',
    verifiedBy: null,
    verifiedAt: null,
    payments: cobros.map(({ pago, order }) => ({ ...pago, order: { id: order.id, orderNumber: order.orderNumber, totalPyg: order.totalPyg, fulfillmentStatus: order.fulfillmentStatus, customer: { name: order.customer?.name || '' } } })),
  }
  write({ ...state, settlements: [rendicion, ...state.settlements] })
  return rendicion
}

export function verificarRendicionDemo(id, state0 = 'VERIFIED', note = '') {
  const state = read()
  const rendicion = state.settlements.find((fila) => fila.id === id)
  if (!rendicion) throw new Error('Rendición no encontrada.')
  rendicion.status = state0
  rendicion.verificationNote = note
  if (state0 === 'VERIFIED') {
    rendicion.verifiedBy = { id: 'demo-user', name: 'Hernán Acosta' }
    rendicion.verifiedAt = new Date().toISOString()
    const ids = new Set((rendicion.payments || []).map((pago) => pago.id))
    for (const order of state.orders) {
      order.payments = (order.payments || []).map((pago) => ids.has(pago.id) ? { ...pago, status: 'CONFIRMED' } : pago)
    }
  }
  write(state)
  return rendicion
}

export function equipoDeRepartoDemo() {
  return [{ id: REPARTIDOR, name: 'Marcos Aquino' }]
}

/** Prefijo visible de los pedidos demo (el mismo del tenant ficticio). */
export const PREFIJO_REPARTO_DEMO = getDemoTenant().orderPrefix || 'AUR'
