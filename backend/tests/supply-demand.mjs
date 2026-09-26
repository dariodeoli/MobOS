import assert from 'node:assert/strict'

// Abastecimiento F1 (#254, dominio clientes) — el vínculo venta → necesidad:
// una venta sobre pedido (sin stock) deja su necesidad con el pedido, la línea
// y el cliente; el nombre del cliente viaja a quien puede gestionarlos; una
// reserva de una unidad existente NO genera compra; y todo queda auditado.
// Corre contra el seed del arnés (base + token admin + token vendedor).
const [base, admin, vendedor] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

const sufijo = Date.now().toString(36).toUpperCase()
const rama = 'branch-a-it'

// 1) Venta «sobre pedido» de un producto sin unidades serializadas.
const producto = await req('/api/products', 'POST', { name: `Demanda ${sufijo}`, sku: `DEM-${sufijo}`, pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: rama }, 201)
const cliente = await req('/api/customers', 'POST', { name: `Cliente Demanda ${sufijo}` }, 201)
const pedido = await req('/api/orders', 'POST', {
  orderNumber: `DEM-${sufijo}`,
  customerId: cliente.id,
  items: [{ productId: producto.id, description: producto.name, quantity: 2, unitPricePyg: 100000, backorder: true }],
  payment: { method: 'CASH', amountPyg: 50000 },
}, 201)

// 2) La necesidad llega vinculada al pedido, a la línea y al cliente.
const vista = await req(`/api/supply/needs?productId=${producto.id}`)
const grupo = (vista.grupos || []).find((fila) => fila.productoId === producto.id)
assert.ok(grupo, 'la venta pendiente deja su grupo en «Por comprar»')
assert.equal(grupo.cantidad, 2, 'la demanda es la cantidad pendiente de la venta')
assert.ok(grupo.origenes.includes('SALE_NO_STOCK'), `la fuente es SALE_NO_STOCK: ${grupo.origenes}`)
const destino = (grupo.destinos || []).find((fila) => fila.pedidoId === pedido.id)
assert.ok(destino, 'la necesidad conserva el pedido original')
assert.equal(destino.tipo, 'PEDIDO')
assert.equal(destino.pedidoNumero, pedido.orderNumber)
assert.equal(destino.clienteId, cliente.id, 'el cliente queda vinculado por id')
assert.equal(destino.cliente, `Cliente Demanda ${sufijo}`, 'quien gestiona clientes ve el nombre')
assert.equal(destino.clienteOculto, false, 'con nombre visible no se marca oculto')
assert.ok(grupo.necesidades.length >= 1, 'la necesidad existe como fila propia')

// 2-bis) FIN (#254): la prioridad pesa la venta cobrada y el margen esperado.
const productoMargen = await req('/api/products', 'POST', { name: `Demanda margen ${sufijo}`, sku: `DEMMG-${sufijo}`, pricePyg: 4000000, costPyg: 1000000, stock: 0, branchId: rama }, 201)
await req('/api/orders', 'POST', {
  orderNumber: `DEMMG-${sufijo}`,
  items: [{ productId: productoMargen.id, description: productoMargen.name, quantity: 1, unitPricePyg: 4000000, backorder: true }],
  payment: { method: 'CASH', amountPyg: 4000000 },
}, 201)
const vistaMargen = await req(`/api/supply/needs?productId=${productoMargen.id}`)
const grupoMargen = (vistaMargen.grupos || []).find((fila) => fila.productoId === productoMargen.id)
assert.ok(grupoMargen, 'la venta cobrada de margen alto deja su necesidad')
assert.equal(grupoMargen.prioridad, 'URGENTE', 'cobrada + margen alto (3.000.000) sin promesa: urgente')

// 3) La creación automática deja auditoría (área Abastecimiento).
const auditoria = await req('/api/audit?q=SUPPLY_NEED_CREATED&limit=100')
assert.ok(
  Array.isArray(auditoria) && auditoria.some((fila) => fila.action === 'SUPPLY_NEED_CREATED' && grupo.necesidades.includes(fila.entityId)),
  'la necesidad automática queda auditada',
)

// 4) Reserva de una unidad existente: no pide compra (la unidad está).
const productoReserva = await req('/api/products', 'POST', { name: `Reserva ${sufijo}`, sku: `RES-${sufijo}`, pricePyg: 1000000, stock: 0, branchId: rama }, 201)
const serial = `DEMRES${sufijo}`.slice(0, 20)
await req('/api/inventory-units', 'POST', { productId: productoReserva.id, serials: [serial], branchId: rama }, 201)
await req('/api/inventory-reservations', 'POST', { serials: [serial], minutes: 60, customerId: cliente.id }, 201)
const vistaReserva = await req(`/api/supply/needs?productId=${productoReserva.id}`)
assert.equal((vistaReserva.grupos || []).length, 0, 'una reserva de unidad existente no genera necesidad')

// 5) Permisos: el panel de compras no es para cualquier rol.
await req('/api/supply/needs', 'GET', undefined, 401, 'token-invalido')
if (vendedor) await req('/api/supply/needs', 'GET', undefined, 403, vendedor)

console.log(`PASS: vínculo venta → necesidad con cliente y reserva sin compra · ${checks} chequeos`)
