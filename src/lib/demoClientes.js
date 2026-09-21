import { leerDemo, guardarDemo } from './demoStorage.js'
// Datos ficticios del modo demo para Clientes (#189/#194). Nada de esto sale
// del navegador: los seeds se muestran siempre y lo que se crea se guarda en
// localStorage. La ficha, la cronología y el portal se arman con estos datos
// para que la demo se vea completa sin pegarle al API real.

const KEY = 'mobos:demo-customers:v1'
const hoy = () => new Date()
const haceDias = (dias) => new Date(hoy().getTime() - dias * 86400000).toISOString()
const usuarioDemo = (nombre = 'Equipo demo') => ({ id: 'demo-user', name: nombre })

const EVENTOS = (customer) => [
  { id: 'demo-e1', type: 'customer', action: 'Cliente creado', createdAt: customer.createdAt, user: usuarioDemo('Dueño demo'), detail: 'Alta en el mostrador' },
  { id: 'demo-e2', type: 'order', action: 'Pedido creado', createdAt: haceDias(12), user: usuarioDemo('Vendedor demo'), detail: 'Pedido MOB #0008 · Gs 3.000.000 · Pendiente' },
  { id: 'demo-e3', type: 'payment', action: 'Pago confirmado', createdAt: haceDias(10), user: usuarioDemo('Caja demo'), detail: 'Pedido MOB #0008 · Gs 1.500.000 · CASH' },
  { id: 'demo-e4', type: 'note', action: 'Comentario del equipo', createdAt: haceDias(8), user: usuarioDemo('Vendedor demo'), detail: 'Prefiere retirar por la tarde.' },
  { id: 'demo-e5', type: 'followUp', action: 'Seguimiento agendado', createdAt: haceDias(6), user: usuarioDemo('Vendedor demo'), detail: 'Llamada · para hoy · Confirmar retiro' },
  { id: 'demo-e6', type: 'audit', action: 'Solicitud comercial aprobada', label: 'Solicitud comercial aprobada', createdAt: haceDias(4), user: usuarioDemo('Administración demo'), detail: 'Crédito · Autorizado: límite Gs 2.000.000 · 15 día(s)' },
  { id: 'demo-e7', type: 'warranty', action: 'Garantía registrada', createdAt: haceDias(3), user: usuarioDemo('Taller demo'), detail: 'iPhone 15 · serial DEMO-FERNANDEZ · En diagnóstico' },
  { id: 'demo-e8', type: 'audit', action: 'Tipo de cliente actualizado', label: 'Tipo de cliente actualizado', createdAt: haceDias(2), user: usuarioDemo('Administración demo'), detail: 'Campos: Tipo de cliente' },
]

const ANALITICA = (orders) => {
  const totalPyg = orders.reduce((suma, order) => suma + order.totalPyg, 0)
  const count = orders.length
  return {
    ordersCount: count,
    totalPyg,
    avgTicketPyg: count ? Math.round(totalPyg / count) : 0,
    firstPurchaseAt: orders[count - 1]?.createdAt || null,
    lastPurchaseAt: orders[0]?.createdAt || null,
    purchasesPerMonth: 1.5,
    spendPerMonthPyg: 950000,
    frequencyDays: 24,
    customerSince: haceDias(120),
    antiguedadDias: 120,
    byMonth: [
      { month: '2026-08', label: 'ago 2026', count: 2, totalPyg: 4800000 },
      { month: '2026-09', label: 'sep 2026', count: 1, totalPyg: 3000000 },
    ],
    topProducts: [
      { description: 'iPhone 15 · 128 GB', quantity: 2, totalPyg: 6000000 },
      { description: 'Cargador USB-C', quantity: 3, totalPyg: 240000 },
    ],
    topModels: [{ model: 'iPhone 15', quantity: 2, totalPyg: 6000000 }],
    topCategories: [{ category: 'Celulares', quantity: 2, totalPyg: 6000000 }],
    topMonths: [{ month: '2026-08', label: 'ago 2026', count: 2, totalPyg: 4800000 }],
    topWeekdays: [{ day: 'Lunes', count: 2, totalPyg: 4800000 }],
    statement: orders.map((order) => ({ orderNumber: order.orderNumber, createdAt: order.createdAt, totalPyg: order.totalPyg, status: order.status })),
  }
}

const pedido = ({ id, numero, total, pagado, estado = 'COMPLETED', dias, items = [] }) => ({
  id,
  orderNumber: numero,
  totalPyg: total,
  collectedPyg: pagado,
  pendingPyg: Math.max(0, total - pagado),
  createdAt: haceDias(dias),
  status: estado,
  branch: { id: 'mobos-demo-central', name: 'Tienda demo' },
  seller: usuarioDemo('Vendedor demo'),
  serials: [],
  items,
})

export const SEED_DEMO_CLIENTES = [
  {
    id: 'demo-cliente-lucia',
    name: 'Lucía Fernández',
    firstName: 'Lucía',
    secondName: 'Fernández',
    createdAt: haceDias(120),
    document: '3.456.789',
    email: 'lucia@ejemplo.com',
    phone: '0981123456',
    countryCode: '+595',
    billingName: 'Fernández & Cía.',
    billingDocument: '80012345-6',
    notes: 'Prefiere retirar por la tarde. Raya lateral en el equipo anterior.',
    taxExempt: false,
    tags: ['prioridad'],
    pricingTier: 'RETAIL',
    creditLimitPyg: 2000000,
    creditDays: 15,
    insuranceEnabled: true,
    insuranceRatePct: 12.5,
    addresses: [{ id: 'demo-dir-1', label: 'Casa', address: 'Av. Mcal. López 1234', city: 'Asunción', department: 'Capital', country: 'Paraguay', isDefault: true }],
    demoProfile: {
      orders: [
        pedido({ id: 'demo-p-8', numero: 'MOB-0008', total: 3000000, pagado: 1500000, estado: 'PENDING', dias: 12, items: [{ id: 'demo-i-8', description: 'iPhone 15 · 128 GB', quantity: 1, serials: ['356789012345678'] }] }),
        pedido({ id: 'demo-p-5', numero: 'MOB-0005', total: 1800000, pagado: 1800000, dias: 45, items: [{ id: 'demo-i-5', description: 'Apple Watch SE', quantity: 1, serials: [] }] }),
        pedido({ id: 'demo-p-2', numero: 'MOB-0002', total: 900000, pagado: 900000, dias: 95, items: [{ id: 'demo-i-2', description: 'AirPods 3', quantity: 1, serials: [] }] }),
      ],
      warranties: [],
      notes: [
        { id: 'demo-n-1', content: 'Prefiere retirar por la tarde.', createdAt: haceDias(8), user: usuarioDemo('Vendedor demo') },
        { id: 'demo-n-2', content: 'Cliente frecuente: avisarle de promociones de accesorios.', createdAt: haceDias(30), user: usuarioDemo('Administración demo') },
      ],
      followUps: [
        { id: 'demo-f-1', kind: 'CALL', note: 'Confirmar retiro del pedido MOB #0008.', dueAt: hoy().toISOString(), doneAt: null, createdAt: haceDias(6), user: usuarioDemo('Vendedor demo') },
      ],
      billingIdentities: [
        { id: 'demo-b-1', name: 'Fernández & Cía.', document: '80012345-6', uses: 3, lastUsedAt: haceDias(12) },
        { id: 'demo-b-2', name: 'Lucía Fernández', document: '3.456.789', uses: 1, lastUsedAt: haceDias(95) },
      ],
    },
  },
  {
    id: 'demo-cliente-distribuidora',
    name: 'Distribuidora del Este S.A.',
    firstName: 'Distribuidora',
    secondName: 'del Este S.A.',
    createdAt: haceDias(300),
    document: '80045678-9',
    email: 'compras@distribuidoraeste.ejemplo',
    phone: '0982555111',
    countryCode: '+595',
    billingName: 'Distribuidora del Este S.A.',
    billingDocument: '80045678-9',
    notes: 'Compra por volumen: coordinar entrega en depósito.',
    taxExempt: false,
    tags: ['mayorista', 'prioridad'],
    pricingTier: 'WHOLESALE',
    creditLimitPyg: 20000000,
    creditDays: 30,
    insuranceEnabled: false,
    insuranceRatePct: null,
    addresses: [{ id: 'demo-dir-2', label: 'Depósito', address: 'Km 12 Ruta 2', city: 'Ciudad del Este', department: 'Alto Paraná', country: 'Paraguay', isDefault: true }],
    demoProfile: {
      orders: [
        pedido({ id: 'demo-p-7', numero: 'MOB-0007', total: 12500000, pagado: 12500000, dias: 20, items: [{ id: 'demo-i-7', description: 'iPhone 14 · 128 GB', quantity: 5, serials: [] }] }),
        pedido({ id: 'demo-p-3', numero: 'MOB-0003', total: 8000000, pagado: 8000000, dias: 70, items: [{ id: 'demo-i-3', description: 'iPad 10', quantity: 4, serials: [] }] }),
      ],
      warranties: [],
      notes: [{ id: 'demo-n-3', content: 'Compra por volumen: coordinar entrega en depósito.', createdAt: haceDias(18), user: usuarioDemo('Administración demo') }],
      followUps: [],
      billingIdentities: [{ id: 'demo-b-3', name: 'Distribuidora del Este S.A.', document: '80045678-9', uses: 2, lastUsedAt: haceDias(20) }],
    },
  },
  {
    id: 'demo-cliente-carlos',
    name: 'Carlos Ramírez',
    firstName: 'Carlos',
    secondName: 'Ramírez',
    createdAt: haceDias(40),
    document: '4.111.222',
    email: 'carlos.ramirez@ejemplo.com',
    phone: '0971222333',
    countryCode: '+595',
    billingName: '',
    billingDocument: '',
    notes: '',
    taxExempt: true,
    tags: [],
    pricingTier: 'RETAIL',
    creditLimitPyg: 0,
    creditDays: null,
    insuranceEnabled: false,
    insuranceRatePct: null,
    addresses: [{ id: 'demo-dir-3', label: 'Casa', address: 'Calle Palma 456', city: 'Luque', department: 'Central', country: 'Paraguay', isDefault: true }],
    demoProfile: {
      orders: [pedido({ id: 'demo-p-1', numero: 'MOB-0001', total: 450000, pagado: 450000, dias: 35, items: [{ id: 'demo-i-1', description: 'Cargador USB-C', quantity: 1, serials: [] }] })],
      warranties: [],
      notes: [],
      followUps: [],
      billingIdentities: [],
    },
  },
]

export function clientesDemoGuardados() {
  try {
    const stored = JSON.parse(leerDemo(KEY) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

export function guardarClienteDemo(customer) {
  const lista = [...clientesDemoGuardados(), customer]
  guardarDemo(KEY, JSON.stringify(lista))
  return customer
}

// Perfil que consume la ficha en modo demo: mismos campos que el API, con
// datos ficticios visibles (pedidos, deuda, cronología, comentarios, facturación).
export function buildDemoProfile(customer = {}) {
  const demo = customer.demoProfile || {}
  const orders = Array.isArray(demo.orders) ? demo.orders : []
  return {
    customer: { ...customer, demoProfile: undefined },
    orders,
    warranties: Array.isArray(demo.warranties) ? demo.warranties : [],
    notes: Array.isArray(demo.notes) ? demo.notes : [],
    followUps: Array.isArray(demo.followUps) ? demo.followUps : [],
    billingIdentities: Array.isArray(demo.billingIdentities) ? demo.billingIdentities : [],
    debtPyg: orders.reduce((suma, order) => suma + Number(order.pendingPyg || 0), 0),
    demo: true,
  }
}

export function buildDemoTimeline(customer = {}) {
  if (Array.isArray(customer.demoProfile?.timeline)) return customer.demoProfile.timeline
  return EVENTOS(customer).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function buildDemoAnalytics(customer = {}) {
  const orders = customer.demoProfile?.orders || []
  if (!orders.length) {
    return { ordersCount: 0, totalPyg: 0, avgTicketPyg: 0, purchasesPerMonth: 0, spendPerMonthPyg: 0, frequencyDays: null, antiguedadDias: 0, byMonth: [], topProducts: [], topModels: [], topCategories: [], topMonths: [], topWeekdays: [], statement: [] }
  }
  return ANALITICA(orders)
}

// Portal demo: el token `demo-<cliente>-<nivel>` se resuelve en el navegador,
// sin tocar el API (mismo criterio que la ficha).
export const esTokenDemo = (token) => String(token || '').startsWith('demo-')

export function clienteDeTokenDemo(token) {
  // token = demo-<id del cliente>-<nivel>; el id puede tener guiones.
  const partes = String(token || '').replace(/^demo-/, '').split('-')
  const nivel = partes.pop()
  const id = partes.join('-')
  const cliente = SEED_DEMO_CLIENTES.find((row) => row.id === id) || clientesDemoGuardados().find((row) => row.id === id) || null
  return { cliente, nivel: nivel === 'completo' ? 'completo' : 'rapido' }
}

const saldoDeuda = (cliente) => (cliente.demoProfile?.orders || []).reduce((suma, order) => suma + Number(order.pendingPyg || 0), 0)

// Payload con la forma de /api/portal/:token (cuenta por QR).
export function demoCuentaPayload(token) {
  const { cliente, nivel } = clienteDeTokenDemo(token)
  if (!cliente) return null
  const orders = cliente.demoProfile?.orders || []
  const conSaldo = orders.filter((order) => Number(order.pendingPyg || 0) > 0).map((order) => ({ orderNumber: order.orderNumber, dueAt: haceDias(-6), pendingPyg: order.pendingPyg }))
  return {
    level: nivel,
    company: { name: 'Tienda demo', logo: false },
    customer: { name: cliente.name, ...(cliente.publicNote ? { publicNote: cliente.publicNote } : {}) },
    balancePyg: saldoDeuda(cliente),
    dueDates: conSaldo,
    orders: orders.map((order) => ({ orderNumber: order.orderNumber, createdAt: order.createdAt, totalPyg: order.totalPyg, status: order.status, fulfillmentStatus: 'DELIVERED', pendingPyg: order.pendingPyg, dueAt: order.pendingPyg > 0 ? haceDias(-6) : null, ...(nivel === 'completo' ? { receiptToken: `demo-${order.id}` } : {}) })),
    ...(nivel === 'completo' ? { warranties: [], addresses: cliente.addresses || [] } : {}),
  }
}

// Payload con la forma de /api/public/portal/:token (vitrina).
export function demoVitrinaPayload(token) {
  const { cliente, nivel } = clienteDeTokenDemo(token)
  if (!cliente) return null
  const orders = cliente.demoProfile?.orders || []
  return {
    nivel,
    tienda: { nombre: 'Tienda demo', tieneLogo: false },
    cliente: { nombre: cliente.name },
    saldoFavorPyg: 0,
    puntosPyg: 0,
    pedidos: orders.map((order) => ({ numero: order.orderNumber, fecha: order.createdAt, estado: order.status, fulfillmentStatus: 'DELIVERED', totalPyg: order.totalPyg, saldoPyg: order.pendingPyg })),
    garantias: [],
  }
}
