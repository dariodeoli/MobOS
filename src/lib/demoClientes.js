import { leerDemo, guardarDemo } from './demoStorage.js'
import { formatGs } from '../utils/moneda.js'
import { codigoPedido } from '../utils/pedido.js'
import { etiquetaServicio } from './estadosServicio.js'
import { IMEIS_DEMO_FICTICIOS as AUR_SERIALES } from './demo/iphones.js'
import { analiticaDePedidos } from './customerAggregates.js'
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
  { id: 'demo-e2', type: 'order', action: 'Pedido creado', createdAt: haceDias(12), user: usuarioDemo('Diego López'), detail: 'Pedido MOB #0008 · Gs 3.000.000 · Pendiente' },
  { id: 'demo-e3', type: 'payment', action: 'Pago confirmado', createdAt: haceDias(10), user: usuarioDemo('Caja demo'), detail: 'Pedido MOB #0008 · Gs 1.500.000 · CASH' },
  { id: 'demo-e4', type: 'note', action: 'Comentario del equipo', createdAt: haceDias(8), user: usuarioDemo('Diego López'), detail: 'Prefiere retirar por la tarde.' },
  { id: 'demo-e5', type: 'followUp', action: 'Seguimiento agendado', createdAt: haceDias(6), user: usuarioDemo('Diego López'), detail: 'Llamada · para hoy · Confirmar retiro' },
  { id: 'demo-e6', type: 'audit', action: 'Solicitud comercial aprobada', label: 'Solicitud comercial aprobada', createdAt: haceDias(4), user: usuarioDemo('Ana Giménez'), detail: 'Crédito · Autorizado: límite Gs 2.000.000 · 15 día(s)' },
  { id: 'demo-e7', type: 'warranty', action: 'Garantía registrada', createdAt: haceDias(3), user: usuarioDemo('Taller demo'), detail: 'iPhone 15 · serial DEMO-FERNANDEZ · En diagnóstico' },
  { id: 'demo-e8', type: 'audit', action: 'Tipo de cliente actualizado', label: 'Tipo de cliente actualizado', createdAt: haceDias(2), user: usuarioDemo('Ana Giménez'), detail: 'Campos: Tipo de cliente' },
]

const ANALITICA_VACIA = { ordersCount: 0, totalPyg: 0, avgTicketPyg: 0, purchasesPerMonth: 0, spendPerMonthPyg: 0, frequencyDays: null, antiguedadDias: 0, byMonth: [], topProducts: [], topModels: [], topCategories: [], topMonths: [], topWeekdays: [], statement: [] }

const pedido = ({ id, numero, total, pagado, estado = 'COMPLETED', dias, items = [], entrega = 'DELIVERY', estadoEntrega = 'DELIVERED' }) => ({
  id,
  orderNumber: numero,
  totalPyg: total,
  collectedPyg: pagado,
  pendingPyg: Math.max(0, total - pagado),
  createdAt: haceDias(dias),
  status: estado,
  // Entrega (#240 → portal): el portal demo muestra el mismo paso a paso que
  // la cuenta real (método y estado del fulfillment).
  deliveryType: entrega,
  fulfillmentStatus: estadoEntrega,
  branch: { id: 'mobos-demo-central', name: 'Aurora Móviles' },
  seller: usuarioDemo('Diego López'),
  serials: [],
  items,
})

export const SEED_DEMO_CLIENTES = [
  {
    id: 'demo-cliente-lucia',
    name: 'Lucía Fernández',
    firstName: 'Lucía',
    secondName: 'Fernández',
    createdAt: haceDias(760),
    document: '3.456.789',
    email: 'lucia@ejemplo.com',
    phone: '0981123456',
    countryCode: '+595',
    billingName: 'Fernández & Cía.',
    billingDocument: '80012345-6',
    notes: 'Prefiere retirar por la tarde. Raya lateral en el equipo anterior.',
    publicNote: '¡Gracias por ser parte de Aurora Móviles! Cualquier consulta, escribinos y te respondemos al toque.',
    taxExempt: false,
    tags: ['prioridad'],
    pricingTier: 'RETAIL',
    creditLimitPyg: 2000000,
    creditDays: 15,
    insuranceEnabled: true,
    insuranceRatePct: 12.5,
    // Tus beneficios (#240 → portal): saldo a favor y puntos visibles en la cuenta.
    saldoFavorPyg: 250000,
    puntosPyg: 45000,
    addresses: [
      { id: 'demo-dir-1', label: 'Casa', address: 'Av. Mcal. López 1234', city: 'Asunción', department: 'Capital', country: 'Paraguay', isDefault: true },
      { id: 'demo-dir-1b', label: 'Trabajo', address: 'Av. España 500', city: 'Asunción', department: 'Capital', country: 'Paraguay', isDefault: false },
    ],
    demoProfile: {
      orders: [
        pedido({ id: 'demo-p-8', numero: 'MOB-0008', total: 3000000, pagado: 1500000, estado: 'PENDING', dias: 12, entrega: 'DELIVERY', estadoEntrega: 'IN_TRANSIT', items: [{ id: 'demo-i-8', description: 'iPhone 15 · 128 GB', quantity: 1, model: 'iPhone 15', category: 'Celulares', serials: ['356789012345678'] }] }),
        pedido({ id: 'demo-p-5', numero: 'MOB-0005', total: 1800000, pagado: 1800000, dias: 45, items: [{ id: 'demo-i-5', description: 'Apple Watch SE', quantity: 1, model: 'Apple Watch SE', category: 'Apple Watch', serials: [] }] }),
        pedido({ id: 'demo-p-2', numero: 'MOB-0002', total: 900000, pagado: 900000, dias: 95, items: [{ id: 'demo-i-2', description: 'AirPods 3', quantity: 1, model: 'AirPods 3', category: 'Accesorios', serials: [] }] }),
        pedido({ id: 'demo-p-31', numero: 'MOB-0031', total: 2400000, pagado: 2400000, estado: 'CANCELLED', dias: 200, items: [{ id: 'demo-i-31', description: 'iPhone 14 · 128 GB', quantity: 1, model: 'iPhone 14', category: 'Celulares', serials: [] }] }),
        pedido({ id: 'demo-p-12', numero: 'MOB-0012', total: 1200000, pagado: 1200000, dias: 400, items: [{ id: 'demo-i-12', description: 'iPad 10 · 64 GB', quantity: 1, model: 'iPad 10', category: 'Celulares', serials: [] }] }),
        pedido({ id: 'demo-p-3', numero: 'MOB-0003', total: 850000, pagado: 850000, dias: 700, items: [{ id: 'demo-i-3', description: 'Cargador USB-C y funda', quantity: 2, model: 'Cargador USB-C', category: 'Accesorios', serials: [] }] }),
      ],
      warranties: [
        { id: 'demo-g-1', serial: '356789012345678', description: 'iPhone 15 · 128 GB', status: 'DIAGNOSIS', warrantyDays: 365, expiresAt: haceDias(-300), createdAt: haceDias(60), publicToken: 'demo-garantia-lucia', coverage: 'Fallas de fábrica del equipo\nBatería con salud por debajo del 80%\nDefectos de pantalla sin golpes', exclusions: 'Daños por golpes o líquidos\nIntervenciones de terceros\nDesgaste normal del uso' },
      ],
      notes: [
        { id: 'demo-n-1', content: 'Prefiere retirar por la tarde.', createdAt: haceDias(8), user: usuarioDemo('Diego López') },
        { id: 'demo-n-2', content: 'Cliente frecuente: avisarle de promociones de accesorios.', createdAt: haceDias(30), user: usuarioDemo('Ana Giménez') },
      ],
      followUps: [
        { id: 'demo-f-1', kind: 'CALL', note: 'Confirmar retiro del pedido MOB #0008.', dueAt: hoy().toISOString(), doneAt: null, createdAt: haceDias(6), user: usuarioDemo('Diego López') },
      ],
      billingIdentities: [
        { id: 'demo-b-1', name: 'Fernández & Cía.', document: '80012345-6', uses: 3, lastUsedAt: haceDias(12) },
        { id: 'demo-b-2', name: 'Lucía Fernández', document: '3.456.789', uses: 1, lastUsedAt: haceDias(95) },
      ],
      services: [
        { id: 'demo-os-1', serviceNumber: 'OS-0004', device: 'iPhone 12 · 128 GB', serviceName: 'Cambio de batería', serial: 'AUR002100000000', status: 'LISTO', receivedAt: haceDias(5), deliveredAt: null },
      ],
      // Mensajes de la tienda (#240 → portal): uno visto y uno nuevo.
      notices: [
        { id: 'demo-av-2', content: 'Tu equipo ya está listo para retirar: te esperamos de 9 a 19 h.', createdAt: haceDias(1), firstViewedAt: null, user: { id: 'demo-user', name: 'Diego López' } },
        { id: 'demo-av-1', content: '¡Gracias por tu compra! Cualquier consulta sobre el equipo, escribinos.', createdAt: haceDias(6), firstViewedAt: haceDias(5), user: { id: 'demo-user', name: 'Ana Giménez' } },
      ],
    },
  },
  {
    id: 'demo-cliente-distribuidora',
    name: 'Distribuidora del Este S.A.',
    firstName: 'Distribuidora',
    secondName: 'del Este S.A.',
    createdAt: haceDias(320),
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
    addresses: [
      { id: 'demo-dir-2', label: 'Depósito', address: 'Km 12 Ruta 2', city: 'Ciudad del Este', department: 'Alto Paraná', country: 'Paraguay', isDefault: true },
      { id: 'demo-dir-2b', label: 'Sucursal', address: 'Av. San Blas 45', city: 'Ciudad del Este', department: 'Alto Paraná', country: 'Paraguay', isDefault: false },
    ],
    demoProfile: {
      orders: [
        pedido({ id: 'demo-p-7', numero: 'MOB-0007', total: 12500000, pagado: 12500000, dias: 20, items: [{ id: 'demo-i-7', description: 'iPhone 14 · 128 GB', quantity: 5, model: 'iPhone 14', category: 'Celulares', serials: [] }] }),
        pedido({ id: 'demo-p-3', numero: 'MOB-0003', total: 8000000, pagado: 8000000, dias: 70, items: [{ id: 'demo-i-3', description: 'iPad 10', quantity: 4, model: 'iPad 10', category: 'Celulares', serials: [] }] }),
        pedido({ id: 'demo-p-19', numero: 'MOB-0019', total: 5500000, pagado: 5500000, dias: 250, items: [{ id: 'demo-i-19', description: 'MacBook Air M2', quantity: 1, model: 'MacBook Air M2', category: 'Mac', serials: [] }] }),
      ],
      warranties: [],
      notes: [{ id: 'demo-n-3', content: 'Compra por volumen: coordinar entrega en depósito.', createdAt: haceDias(18), user: usuarioDemo('Ana Giménez') }],
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
    tags: ['ocasional'],
    pricingTier: 'RETAIL',
    creditLimitPyg: 0,
    creditDays: null,
    insuranceEnabled: false,
    insuranceRatePct: null,
    addresses: [{ id: 'demo-dir-3', label: 'Casa', address: 'Calle Palma 456', city: 'Luque', department: 'Central', country: 'Paraguay', isDefault: true }],
    // Reserva vigente (#240 → portal): vence en 2 días.
    reservas: [{ serial: 'AUR002500000000', model: 'iPhone 13', capacity: '128 GB', branch: 'Casa Central', reservedUntil: haceDias(-2) }],
    demoProfile: {
      orders: [
        pedido({ id: 'demo-p-1', numero: 'MOB-0001', total: 450000, pagado: 450000, dias: 35, items: [{ id: 'demo-i-1', description: 'Cargador USB-C', quantity: 1, model: 'Cargador USB-C', category: 'Accesorios', serials: [] }] }),
        pedido({ id: 'demo-p-4', numero: 'MOB-0004', total: 320000, pagado: 320000, dias: 8, entrega: 'RETIRO', estadoEntrega: 'READY_FOR_PICKUP', items: [{ id: 'demo-i-4', description: 'Funda + vidrio templado', quantity: 2, model: 'Funda', category: 'Accesorios', serials: [] }] }),
      ],
      warranties: [],
      notes: [],
      followUps: [],
      billingIdentities: [],
      services: [
        { id: 'demo-os-2', serviceNumber: 'OS-0003', device: 'iPhone 13 · 128 GB', serviceName: 'Cambio de módulo de carga', serial: 'AUR002200000000', status: 'ENTREGADO', receivedAt: haceDias(40), deliveredAt: haceDias(30) },
      ],
    },
  },
]
// #213: cartera demo ampliada a 12 clientes ficticios (teléfonos +595, CI/RUC
// ficticios, direcciones y su historia mínima de pedidos/notas).
const clienteExtra = (id, nombres, documento, telefono, ciudad, opciones = {}) => ({
  id,
  name: nombres,
  firstName: nombres.split(' ')[0],
  secondName: nombres.split(' ').slice(1).join(' '),
  createdAt: haceDias(60 + id.length),
  document: documento,
  email: `${id.replace('demo-cliente-', '')}@ejemplo.com`,
  phone: telefono,
  countryCode: '+595',
  billingName: opciones.facturaA || '',
  billingDocument: opciones.facturaDoc || '',
  notes: opciones.notas || '',
  // Un mayorista con RUC no está exento: el flag se pasa explícito (el seed de
  // Carlos es el caso exento). Antes se marcaba exento a todo mayorista.
  taxExempt: opciones.exento === true,
  tags: opciones.tags || [],
  pricingTier: opciones.tier || 'RETAIL',
  creditLimitPyg: opciones.credito || 0,
  creditDays: opciones.dias ?? null,
  insuranceEnabled: Boolean(opciones.seguro),
  insuranceRatePct: opciones.seguro ? 12.5 : null,
  addresses: [
    { id: `${id}-dir`, label: 'Casa', address: `Calle ${nombres.split(' ')[0]} ${100 + id.length}`, city: ciudad, department: 'Central', country: 'Paraguay', isDefault: true },
    ...(opciones.extraDirecciones || []).map((extra, indice) => ({ id: `${id}-dir-${indice + 2}`, isDefault: false, country: 'Paraguay', department: 'Central', ...extra })),
  ],
  demoProfile: {
    orders: opciones.pedidos || [],
    warranties: opciones.garantias || [],
    services: opciones.servicios || [],
    notices: opciones.avisos || [],
    notes: opciones.notas ? [{ id: `${id}-nota`, content: opciones.notas, createdAt: haceDias(10), user: usuarioDemo('Diego López') }] : [],
    followUps: [],
    billingIdentities: [],
  },
})
const pedidoDemo = (id, numero, total, pagado, dias, description) => pedido({ id, numero, total, pagado, dias, items: [{ id: `${id}-i`, description, quantity: 1, serials: [] }] })
SEED_DEMO_CLIENTES.push(
  clienteExtra('demo-cliente-maria', 'María González', '3.987.654', '0983111222', 'Asunción', { tags: ['frecuente'], credito: 1500000, dias: 15, seguro: true, notas: 'Cliente frecuente: siempre paga en fecha.', pedidos: [pedidoDemo('demo-p-9', 'MOB-0009', 6850000, 6850000, 5, 'iPhone 15 Pro · 256 GB')], garantias: [{ id: 'demo-g-3', serial: 'AUR000900000000', description: 'iPhone 15 Pro · 256 GB', status: 'RECEIVED', warrantyDays: 365, expiresAt: haceDias(-12), createdAt: haceDias(353), publicToken: 'demo-garantia-maria', coverage: 'Fallas de fábrica del equipo\nBatería con salud por debajo del 80%', exclusions: 'Daños por golpes o líquidos' }] }),
  clienteExtra('demo-cliente-juan', 'Juan Pereira', '4.556.677', '0981222333', 'San Lorenzo', { tags: ['nuevo'], pedidos: [pedidoDemo('demo-p-10', 'MOB-0010', 4850000, 2000000, 9, 'iPhone 15 · 128 GB')] }),
  clienteExtra('demo-cliente-ana', 'Ana Villalba', '5.111.222', '0972555888', 'Fernando de la Mora', { tags: ['whatsapp'], seguro: true, notes: 'Prefiere contacto por WhatsApp.' }),
  clienteExtra('demo-cliente-ramiro', 'Ramiro Cáceres', '4.222.333', '0985666999', 'Capiatá', { tags: ['reventa'], tier: 'WHOLESALE', credito: 8000000, dias: 30, facturaA: 'Ramiro Import', facturaDoc: '80098765-4', extraDirecciones: [{ label: 'Depósito', address: 'Ruta 1 Km 20' }], pedidos: [pedidoDemo('demo-p-11', 'MOB-0011', 12500000, 12500000, 30, 'iPhone 14 Pro · 256 GB × 3')] }),
  clienteExtra('demo-cliente-estela', 'Estela Ramírez', '3.222.111', '0987999111', 'Asunción', { tags: ['prioridad'], notes: 'Factura a nombre de la empresa del esposo.' }),
  clienteExtra('demo-cliente-distribuidora-luque', 'Distribuidora Luque S.A.', '80077777-1', '0982111000', 'Luque', { tags: ['volumen', 'factura'], tier: 'WHOLESALE', credito: 15000000, dias: 30, facturaA: 'Distribuidora Luque S.A.', facturaDoc: '80077777-1', pedidos: [pedidoDemo('demo-p-12', 'MOB-0012', 9600000, 5000000, 14, 'iPhone 13 · 128 GB × 4')] }),
  clienteExtra('demo-cliente-fernando', 'Fernando Ortellado', '2.888.999', '0973111444', 'Mariano Roque Alonso', { tags: ['frecuente'], servicios: [{ id: 'demo-os-3', serviceNumber: 'OS-0005', device: 'iPhone 11 · 64 GB', serviceName: 'No enciende', serial: 'AUR002300000000', status: 'DIAGNOSTICO', receivedAt: haceDias(2), deliveredAt: null }], garantias: [{ id: 'demo-g-2', serial: 'AUR002300000000', description: 'iPhone 11 · 64 GB', status: 'RECEIVED', warrantyDays: 180, expiresAt: haceDias(-150), createdAt: haceDias(2), publicToken: 'demo-garantia-fernando', coverage: 'Fallas de fábrica del equipo\nBatería con salud por debajo del 80%', exclusions: 'Daños por golpes o líquidos\nIntervenciones de terceros' }] }),
  clienteExtra('demo-cliente-gloria', 'Gloria Martínez', '6.123.456', '0981222777', 'Lambaré', { tags: ['trade-in'], seguro: true, notes: 'Cambió de equipo con trade-in.' }),
  clienteExtra('demo-cliente-hugo', 'Hugo Benítez', '4.999.888', '0986555222', 'Itauguá', { tags: ['moroso'], credito: 1000000, dias: 7, pedidos: [pedidoDemo('demo-p-13', 'MOB-0013', 2350000, 500000, 40, 'iPhone 12 · 128 GB')] }),
)


// #219/#221: historial variado para los clientes demo (varias compras, fechas
// distribuidas en meses/años, montos/estados distintos, productos y seriales).
const historial = (cliente, cantidad, salto = 83, arranque = 24) => Array.from({ length: cantidad }, (_, i) => {
  const productos = [
    ['iPhone 15 Pro · 256 GB', 6850000], ['iPhone 15 · 128 GB', 4850000], ['iPhone 14 · 128 GB', 3600000],
    ['iPhone 13 · 128 GB', 3050000], ['iPhone 12 · 256 GB', 2750000], ['AirPods Pro 2 USB-C', 1850000],
    ['Apple Watch SE', 1800000], ['Cargador USB-C 20W', 220000], ['Funda MagSafe', 180000],
  ]
  const [descripcion, precio] = productos[(cliente.length + i * 3) % productos.length]
  const pagado = i % 4 === 0 ? Math.round(precio * 0.5) : precio
  return pedido({
    id: `${cliente}-p-${i + 1}`,
    numero: `MOB-${String(100 + ((cliente.length + i) % 800)).padStart(4, '0')}`,
    total: precio,
    pagado,
    estado: pagado >= precio ? (i % 3 === 0 ? 'READY_FOR_PICKUP' : 'COMPLETED') : 'PENDING',
    dias: arranque + i * salto,
    items: [{ id: `${cliente}-i-${i + 1}`, description: descripcion, quantity: 1, serials: [AUR_SERIALES[(cliente.length + i) % AUR_SERIALES.length]] }],
  })
})
for (const cliente of SEED_DEMO_CLIENTES) {
  if (!cliente.demoProfile?.orders?.length) cliente.demoProfile.orders = historial(cliente.id, 3 + (cliente.id.length % 4))
}

// ── Seguimiento del informe compartido (#240 ítem 3) ─────────────────────────
// Misma semántica que la cuenta real: una fila por serial con el último envío
// desde la ficha y las aperturas del link público. Las filas viven en memoria
// de la pestaña (mismo criterio que el resto de la demo: al recargar se vuelve
// al seed); los seeds son el ejemplo visible.
const informesVistos = new Map()

const claveSerial = (serial) => String(serial || '').trim().toUpperCase()
const mascaraSerial = (serial) => {
  const texto = String(serial || '').trim()
  return texto.length > 6 ? `${texto.slice(0, 4)}…${texto.slice(-3)}` : texto
}
// Origen congelado de la apertura del informe (mismo vocabulario que el
// backend: correo, WhatsApp, portal y certificado embebible).
const ORIGEN_APERTURA_DEMO = {
  EMAIL: 'Abierto desde el enlace del correo',
  WHATSAPP: 'Abierto desde el enlace de WhatsApp',
  PORTAL: 'Abierto desde el portal del cliente',
  EMBED: 'Abierto desde el certificado embebido',
}

const SEED_INFORMES_DEMO = (() => {
  const filas = {}
  const primerSerial = (clienteId) => {
    const cliente = SEED_DEMO_CLIENTES.find((row) => row.id === clienteId)
    const pedidos = cliente?.demoProfile?.orders || []
    return pedidos.flatMap((order) => (order.items || []).flatMap((item) => item.serials || []))[0] || ''
  }
  const yaVisto = primerSerial('demo-cliente-lucia')
  if (yaVisto) filas[claveSerial(yaVisto)] = { serial: claveSerial(yaVisto), customerId: 'demo-cliente-lucia', channel: 'WHATSAPP', viewChannel: 'WHATSAPP', sharedAt: haceDias(2), firstViewedAt: haceDias(1), lastViewedAt: haceDias(1), viewCount: 2 }
  const sinVer = primerSerial('demo-cliente-ana')
  if (sinVer) filas[claveSerial(sinVer)] = { serial: claveSerial(sinVer), customerId: 'demo-cliente-ana', channel: 'EMAIL', sharedAt: haceDias(3), firstViewedAt: null, lastViewedAt: null, viewCount: 0 }
  return filas
})()

/** Fila de seguimiento demo (lo de la sesión manda sobre el ejemplo del seed). */
export function filaInformeDemo(serial) {
  const clave = claveSerial(serial)
  return informesVistos.get(clave) || SEED_INFORMES_DEMO[clave] || null
}

/** Filas de seguimiento de un cliente (la ficha las mapea por serial). */
export function filasInformeDemo(clienteId) {
  const claves = new Set([...Object.keys(SEED_INFORMES_DEMO), ...informesVistos.keys()])
  return [...claves].map((clave) => filaInformeDemo(clave)).filter((fila) => fila && String(fila.customerId) === String(clienteId))
}

/** Envío desde la ficha: canal + fecha (la ficha muestra «Sin ver»). */
export function registrarInformeDemo(clienteId, { serial, canal = 'WHATSAPP' } = {}) {
  const clave = claveSerial(serial)
  if (!clienteId || !clave) return null
  const fila = {
    firstViewedAt: null,
    lastViewedAt: null,
    viewCount: 0,
    ...(filaInformeDemo(clave) || {}),
    serial: clave,
    customerId: clienteId,
    channel: canal,
    sharedAt: new Date().toISOString(),
  }
  informesVistos.set(clave, fila)
  return fila
}

/** Apertura del informe: la primera vez deja el «visto» (cuenta las veces).
 *  `viewChannel` congela el origen de la primera apertura, igual que el evento
 *  de auditoría real (un reenvío posterior no cambia de dónde se abrió); el
 *  parámetro `canal` permite marcar orígenes puntuales (certificado embebido). */
export function registrarVistoInformeDemo(clienteId, serial, { canal } = {}) {
  const clave = claveSerial(serial)
  if (!clave) return null
  const actual = filaInformeDemo(clave)
  if (!actual && !clienteId) return null
  const ahora = new Date().toISOString()
  const fila = {
    ...(actual || {}),
    serial: clave,
    customerId: actual?.customerId || clienteId,
    channel: actual?.channel ?? null,
    viewChannel: actual?.viewChannel ?? canal ?? actual?.channel ?? null,
    sharedAt: actual?.sharedAt ?? null,
    firstViewedAt: actual?.firstViewedAt || ahora,
    lastViewedAt: ahora,
    viewCount: Number(actual?.viewCount || 0) + 1,
  }
  informesVistos.set(clave, fila)
  return fila
}

/** Eventos de cronología del informe, derivados de las filas de seguimiento:
 *  el envío y la apertura se reconstruyen al abrir la ficha (no dependen de
 *  una interacción registrada en memoria). */
export function eventosInformeDemo(clienteId) {
  return filasInformeDemo(clienteId).flatMap((fila) => {
    const eventos = []
    const canalVisto = fila.viewChannel ?? fila.channel
    if (fila.sharedAt) eventos.push({
      id: `demo-informe-${fila.serial}-envio`,
      type: 'audit',
      action: 'Informe del equipo compartido',
      label: 'Informe del equipo compartido',
      createdAt: fila.sharedAt,
      user: usuarioDemo('Equipo demo'),
      detail: `Por ${fila.channel === 'EMAIL' ? 'correo' : 'WhatsApp'} · serial ${mascaraSerial(fila.serial)}`,
    })
    if (fila.firstViewedAt) eventos.push({
      id: `demo-informe-${fila.serial}-visto`,
      type: 'audit',
      action: 'Informe del equipo visto por el cliente',
      label: 'Informe del equipo visto por el cliente',
      createdAt: fila.firstViewedAt,
      user: null,
      detail: `${ORIGEN_APERTURA_DEMO[canalVisto] || ORIGEN_APERTURA_DEMO.PORTAL} · serial ${mascaraSerial(fila.serial)}`,
    })
    return eventos
  })
}

/** Eventos de cronología del taller, derivados de las órdenes demo (#240 §4):
 *  el ingreso y la entrega se reconstruyen al abrir la ficha. */
export function eventosServicioDemo(cliente) {
  return (cliente?.demoProfile?.services || []).flatMap((servicio) => {
    const eventos = [{
      id: `demo-servicio-${servicio.id}-recibido`,
      type: 'service',
      action: 'Equipo en taller',
      label: 'Equipo en taller',
      createdAt: servicio.receivedAt,
      user: usuarioDemo('Taller demo'),
      detail: [servicio.device, servicio.serial ? `serial ${mascaraSerial(servicio.serial)}` : '', 'Recibido'].filter(Boolean).join(' · '),
    }]
    if (servicio.deliveredAt) eventos.push({
      id: `demo-servicio-${servicio.id}-entregado`,
      type: 'service',
      action: 'Equipo entregado',
      label: 'Equipo entregado',
      createdAt: servicio.deliveredAt,
      user: usuarioDemo('Taller demo'),
      detail: servicio.device || '',
    })
    return eventos
  })
}

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
    // Seguimiento del informe compartido (#240 ítem 3): mismo shape que el API.
    deviceReportShares: filasInformeDemo(customer.id),
    // Servicio técnico (#240 §4): mismas órdenes que muestra el taller.
    serviceOrders: Array.isArray(demo.services) ? demo.services : [],
    // Mensajes de la tienda al cliente (#240 → portal) con su visto/no visto.
    customerNotices: Array.isArray(demo.notices) ? demo.notices : [],
    debtPyg: orders.reduce((suma, order) => suma + Number(order.pendingPyg || 0), 0),
    demo: true,
  }
}

export function buildDemoTimeline(customer = {}) {
  const base = Array.isArray(customer.demoProfile?.timeline) ? customer.demoProfile.timeline : EVENTOS(customer)
  return [...base, ...eventosInformeDemo(customer.id), ...eventosServicioDemo(customer)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function buildDemoAnalytics(customer = {}) {
  const orders = customer.demoProfile?.orders || []
  if (!orders.length) return ANALITICA_VACIA
  return analiticaDePedidos(orders, { customerSince: customer.createdAt })
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

// Pasos de entrega del portal demo (#240 → portal): mismo shape que
// `seguimientoDeEntrega` del backend, con fechas ficticias espaciadas por paso.
const FLUJOS_ENTREGA_DEMO = {
  DELIVERY: ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  RETIRO: ['PROCESSING', 'READY_FOR_PICKUP', 'PICKED_UP'],
}
const ENCABEZADOS_ENTREGA_DEMO = { DELIVERY: 'Seguimiento de envío', RETIRO: 'Seguimiento de retiro' }// Etiquetas espejo de `ETIQUETAS_FLUJO` del backend: la demo dice lo mismo que
// la cuenta real (y el chip del portal usa `tracking.estadoLabel`).
const ETIQUETAS_ENTREGA_DEMO = {
  PROCESSING: 'En preparación',
  READY_TO_SHIP: 'Listo para enviar',
  READY_FOR_PICKUP: 'Listo para retirar',
  IN_TRANSIT: 'En camino al cliente',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  PICKED_UP: 'Retirado',
}

function trackingDemo(order) {
  const metodo = String(order.deliveryType || '').toLowerCase().includes('retiro') ? 'RETIRO' : 'DELIVERY'
  const flujo = FLUJOS_ENTREGA_DEMO[metodo]
  const actual = order.fulfillmentStatus === 'PENDING' ? 'PROCESSING' : String(order.fulfillmentStatus || 'DELIVERED')
  const indice = flujo.indexOf(actual)
  const base = new Date(order.createdAt).getTime()
  return {
    metodo,
    encabezado: ENCABEZADOS_ENTREGA_DEMO[metodo],
    estado: actual,
    estadoLabel: ETIQUETAS_ENTREGA_DEMO[actual] || actual,
    pasos: flujo.map((key, posicion) => ({
      key,
      label: ETIQUETAS_ENTREGA_DEMO[key] || key,
      hecho: indice >= 0 && posicion <= indice,
      actual: key === actual,
      at: indice >= 0 && posicion <= indice ? new Date(base + posicion * 86400000).toISOString() : null,
    })),
  }
}

// Payload con la forma de /api/portal/:token (cuenta por QR).
export function demoCuentaPayload(token) {
  const { cliente, nivel } = clienteDeTokenDemo(token)
  if (!cliente) return null
  const orders = cliente.demoProfile?.orders || []
  const conSaldo = orders.filter((order) => Number(order.pendingPyg || 0) > 0).map((order) => ({ orderNumber: order.orderNumber, dueAt: haceDias(-6), pendingPyg: order.pendingPyg }))
  // Pagos (#240 → portal): historial derivado de los pedidos demo (el método se
  // reparte para que la lista sea creíble; nada sale del navegador).
  const METODOS_DEMO = ['Efectivo', 'Transferencia', 'Tarjeta / POS']
  const pagosDemo = orders
    .filter((order) => Number(order.collectedPyg || 0) > 0)
    .map((order, indice) => ({ amountPyg: Number(order.collectedPyg || 0), methodLabel: METODOS_DEMO[indice % METODOS_DEMO.length], paidAt: order.createdAt, orderNumber: order.orderNumber }))
  return {
    level: nivel,
    company: { name: 'Aurora Móviles', logo: false },
    customer: { name: cliente.name, ...(cliente.publicNote ? { publicNote: cliente.publicNote } : {}) },
    balancePyg: saldoDeuda(cliente),
    // Tus beneficios (#240 → portal): saldo a favor y puntos del cliente.
    saldoFavorPyg: Number(cliente.saldoFavorPyg || 0),
    puntosPyg: Number(cliente.puntosPyg || 0),
    // Reservas (#240 → portal): equipos guardados a nombre del cliente.
    reservas: (cliente.reservas || []).map((reserva) => ({
      serial: reserva.serial || '',
      model: reserva.model || 'Equipo',
      capacity: reserva.capacity || null,
      branch: reserva.branch || null,
      reservedUntil: reserva.reservedUntil || null,
    })),
    // Pagos (#240 → portal): historial y total pagado de la demo.
    pagos: pagosDemo.slice(0, 8),
    totalPagadoPyg: orders.reduce((suma, order) => suma + Number(order.collectedPyg || 0), 0),
    dueDates: conSaldo,
    orders: orders.map((order) => ({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      totalPyg: order.totalPyg,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus || 'DELIVERED',
      // Seguimiento de la entrega (#240 → portal): los pasos del método.
      tracking: trackingDemo(order),
      pendingPyg: order.pendingPyg,
      dueAt: order.pendingPyg > 0 ? haceDias(-6) : null,
      ...(nivel === 'completo' ? { receiptToken: `demo-${order.id}` } : {}),
    })),
    // Mensajes de la tienda (#240 → portal): mismo contrato que /api/portal;
    // el visto se marca al abrir la cuenta (en memoria, como el resto de demo).
    mensajes: (cliente.demoProfile?.notices || []).map((aviso) => {
      const nuevo = !aviso.firstViewedAt
      if (nuevo) aviso.firstViewedAt = new Date().toISOString()
      return { content: aviso.content, createdAt: aviso.createdAt, nuevo }
    }),
    informes: orders.flatMap((order) => (order.items || []).flatMap((item) => (item.serials || []).map((serial) => ({ serial, model: item.description, orderNumber: order.orderNumber })))),
    // Servicio técnico (#240 §4): el portal muestra estado y fechas, sin
    // costos ni datos internos (mismo contrato que /api/portal).
    servicios: (cliente.demoProfile?.services || []).map((servicio) => ({
      serviceNumber: servicio.serviceNumber,
      device: servicio.device,
      serviceName: servicio.serviceName,
      serial: servicio.serial,
      status: servicio.status,
      statusLabel: etiquetaServicio(servicio.status),
      receivedAt: servicio.receivedAt,
      deliveredAt: servicio.deliveredAt,
    })),
    ...(nivel === 'completo' ? {
      // Garantías con su credencial pública (#240 §3 → portal) y el estado del
      // taller cuando el caso derivó en una orden (mismo serial).
      warranties: (cliente.demoProfile?.warranties || []).map((garantia) => {
        const servicio = (cliente.demoProfile?.services || []).find((row) => String(row.serial || '').trim().toUpperCase() === String(garantia.serial || '').trim().toUpperCase())
        const enTaller = servicio && !['ENTREGADO', 'CANCELADO'].includes(servicio.status) ? servicio : null
        return {
          serial: garantia.serial,
          description: garantia.description,
          status: garantia.status,
          warrantyDays: garantia.warrantyDays ?? null,
          expiresAt: garantia.expiresAt || null,
          daysRemaining: garantia.expiresAt ? Math.max(0, Math.ceil((new Date(garantia.expiresAt).getTime() - Date.now()) / 86400000)) : null,
          ...(garantia.publicToken ? { publicToken: garantia.publicToken } : {}),
          ...(enTaller ? { taller: { status: enTaller.status, statusLabel: etiquetaServicio(enTaller.status) } } : {}),
        }
      }),
      addresses: cliente.addresses || [],
    } : {}),
  }
}

// Payload con la forma de /api/public/portal/:token (vitrina).
export function demoVitrinaPayload(token) {
  const { cliente, nivel } = clienteDeTokenDemo(token)
  if (!cliente) return null
  const orders = cliente.demoProfile?.orders || []
  return {
    nivel,
    tienda: { nombre: 'Aurora Móviles', tieneLogo: false },
    cliente: { nombre: cliente.name, ...(cliente.publicNote ? { notaPublica: cliente.publicNote } : {}) },
    saldoFavorPyg: 0,
    puntosPyg: 0,
    pedidos: orders.map((order) => ({ numero: order.orderNumber, fecha: order.createdAt, estado: order.status, fulfillmentStatus: order.fulfillmentStatus || 'DELIVERED', totalPyg: order.totalPyg, saldoPyg: order.pendingPyg })),
    garantias: [],
  }
}

/** Cartera completa de la demo: seeds (#194) + lo creado en esta pestaña (#201). */
export function listarClientesDemo() {
  return [...SEED_DEMO_CLIENTES, ...clientesDemoGuardados()]
}

/** Busca un cliente demo por id (seeds primero, igual que el portal). */
export function buscarClienteDemo(id) {
  return listarClientesDemo().find((row) => String(row.id) === String(id)) || null
}

/** Guarda un cliente demo sin duplicar por id (reemplaza si ya existe). */
export function actualizarClienteDemo(customer) {
  const lista = clientesDemoGuardados()
  const siguiente = lista.some((row) => row.id === customer.id)
    ? lista.map((row) => (row.id === customer.id ? customer : row))
    : [...lista, customer]
  guardarDemo(KEY, JSON.stringify(siguiente))
  return customer
}

/**
 * Registra una venta demo en la ficha del cliente (#160/#194): la vista por
 * actividad reciente, los agregados (#221), la ficha y el portal leen los
 * pedidos del cliente, así que la venta se refleja igual que en la cuenta real.
 * Los seeds viven en la memoria de la pestaña: el objeto mutado es el que leen
 * lista, ficha y portal.
 */
export function registrarPedidoDemoDeVenta(clienteId, venta = {}) {
  const cliente = buscarClienteDemo(clienteId)
  if (!cliente) return null
  const pedido = pedidoDesdeVenta(venta)
  const demo = cliente.demoProfile || (cliente.demoProfile = {})
  demo.orders = [pedido, ...(Array.isArray(demo.orders) ? demo.orders : [])]
  const evento = {
    id: `${pedido.id}-timeline`,
    type: 'order',
    action: 'Pedido creado',
    createdAt: pedido.createdAt,
    user: { id: 'demo-user', name: pedido.seller?.name || 'Equipo demo' },
    detail: `Pedido ${codigoPedido(pedido.orderNumber) || 'Demo'} · ${formatGs(pedido.totalPyg)} · ${pedido.pendingPyg > 0 ? 'Pendiente' : 'Pagado'}`,
  }
  demo.timeline = [evento, ...(Array.isArray(demo.timeline) ? demo.timeline : EVENTOS(cliente))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  if (!SEED_DEMO_CLIENTES.some((row) => row.id === cliente.id)) actualizarClienteDemo(cliente)
  return pedido
}

/**
 * Registra una interacción del equipo en la cronología del cliente demo
 * (#240/#194): compartir el informe del equipo, etc. Solo en el navegador.
 */
export function registrarInteraccionDemo(clienteId, { accion, detalle, tipo = 'note' } = {}) {
  const cliente = buscarClienteDemo(clienteId)
  if (!cliente) return null
  const demo = cliente.demoProfile || (cliente.demoProfile = {})
  const evento = {
    id: `demo-inter-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
    type: tipo,
    action: accion || 'Interacción',
    createdAt: new Date().toISOString(),
    user: { id: 'demo-user', name: 'Equipo demo' },
    detail: detalle || '',
  }
  demo.timeline = [evento, ...(Array.isArray(demo.timeline) ? demo.timeline : EVENTOS(cliente))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  if (!SEED_DEMO_CLIENTES.some((row) => row.id === cliente.id)) actualizarClienteDemo(cliente)
  return evento
}

/** Forma canónica de un pedido demo (misma que los seeds). */
function pedidoDesdeVenta({ numero = '', total = 0, pagado = 0, fecha, items = [], vendedor = '', sucursal = '', estado } = {}) {
  const totalPyg = Math.max(0, Math.round(Number(total) || 0))
  const collectedPyg = Math.max(0, Math.min(totalPyg, Math.round(Number(pagado) || 0)))
  const pendingPyg = Math.max(0, totalPyg - collectedPyg)
  const normalizados = items.map((item, indice) => ({
    id: item.id || `demo-venta-item-${indice + 1}`,
    description: item.description || '',
    quantity: Math.max(1, Number(item.quantity) || 1),
    model: item.model || '',
    category: item.category || '',
    serials: Array.isArray(item.serials) ? item.serials : [],
  }))
  return {
    id: `demo-venta-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    orderNumber: numero,
    totalPyg,
    collectedPyg,
    pendingPyg,
    createdAt: fecha || new Date().toISOString(),
    status: estado || (pendingPyg > 0 ? 'PENDING' : 'COMPLETED'),
    // Una venta del mostrador se retira en el acto (#240 → portal).
    deliveryType: 'RETIRO',
    fulfillmentStatus: 'PICKED_UP',
    branch: { id: 'mobos-demo-central', name: sucursal || 'Casa Central' },
    seller: { id: 'demo-user', name: vendedor || 'Equipo demo' },
    serials: normalizados.flatMap((item) => item.serials),
    items: normalizados,
  }
}
