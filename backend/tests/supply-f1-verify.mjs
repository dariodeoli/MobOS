import assert from 'node:assert/strict'

// Verificación independiente de F1 (#254, dominio clientes) — el vínculo
// venta/reserva → necesidad, sobre el motor de INV:
//   1. venta sobre pedido (sin stock) → necesidad vinculada al pedido/cliente,
//      con la promesa como prioridad, y SIN crear stock;
//   2. venta offline que vendió más que el stock → QUANTITY_OVER_STOCK por la
//      diferencia exacta;
//   3. reserva con faltante → reserva lo existente y pide SOLO la diferencia;
//   4. reserva de una unidad existente → no genera compra.
// Corre contra el seed del arnés (base + token admin).
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0
async function req(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

const sufijo = Date.now().toString(36).toUpperCase()
const rama = 'branch-a-it'
const stockDe = async (producto) => Number((await req(`/api/products?q=${producto.sku}`)).find((fila) => fila.id === producto.id)?.stock ?? -1)

// 1) Venta sobre pedido: la necesidad nace vinculada y no crea stock.
const producto = await req('/api/products', 'POST', { name: `F1 vínculo ${sufijo}`, sku: `F1V-${sufijo}`, pricePyg: 1000000, costPyg: 700000, stock: 0, branchId: rama }, 201)
const cliente = await req('/api/customers', 'POST', { name: `Cliente F1 ${sufijo}` }, 201)
const prometida = new Date(Date.now() + 36 * 3600000).toISOString()
const pedido = await req('/api/orders', 'POST', {
  orderNumber: `F1V-${sufijo}`,
  customerId: cliente.id,
  promisedAt: prometida,
  items: [{ productId: producto.id, description: producto.name, quantity: 2, unitPricePyg: 1000000, backorder: true }],
  payment: { method: 'CASH', amountPyg: 1000000 },
}, 201)
const panel = await req(`/api/supply/needs?productId=${producto.id}`)
const grupo = (panel.grupos || []).find((fila) => fila.productoId === producto.id)
assert.ok(grupo, 'la venta sobre pedido dejó su necesidad')
const destino = (grupo.destinos || []).find((fila) => fila.pedidoId === pedido.id)
assert.ok(destino, 'el destino conserva el pedido')
assert.equal(destino.cantidad, 2, 'la cantidad es lo que quedó sin cubrir')
assert.equal(destino.clienteId, cliente.id, 'el cliente queda vinculado')
assert.equal(destino.cliente, `Cliente F1 ${sufijo}`, 'quien gestiona clientes ve el nombre')
assert.equal(destino.clienteOculto, false)
assert.ok(grupo.origenes.includes('ORDER_COMMITTED'), `con promesa la fuente es ORDER_COMMITTED: ${grupo.origenes}`)
assert.equal(grupo.prioridad, 'ALTA', 'la promesa a 36 h manda la prioridad')
assert.equal(await stockDe(producto), 0, 'la necesidad no crea stock')
const auditoria = await req('/api/audit?q=SUPPLY_NEED_CREATED&limit=100')
assert.ok(
  Array.isArray(auditoria) && auditoria.some((fila) => fila.action === 'SUPPLY_NEED_CREATED' && grupo.necesidades.includes(fila.entityId)),
  'la necesidad automática queda auditada (SUPPLY_NEED_CREATED)',
)

// 2) Venta offline que superó el stock: QUANTITY_OVER_STOCK por la diferencia.
const productoOff = await req('/api/products', 'POST', { name: `F1 offline ${sufijo}`, sku: `F1O-${sufijo}`, pricePyg: 500000, costPyg: 300000, stock: 2, branchId: rama }, 201)
await req('/api/orders', 'POST', {
  orderNumber: `F1O-${sufijo}`,
  offline: true,
  items: [{ productId: productoOff.id, description: 'Venta offline', quantity: 5, unitPricePyg: 500000 }],
  payment: { method: 'CASH', amountPyg: 2500000 },
}, 201)
const panelOff = await req(`/api/supply/needs?productId=${productoOff.id}`)
const grupoOff = (panelOff.grupos || []).find((fila) => fila.productoId === productoOff.id)
assert.ok(grupoOff, 'la venta offline dejó su necesidad')
assert.ok(grupoOff.origenes.includes('QUANTITY_OVER_STOCK'), `la fuente es QUANTITY_OVER_STOCK: ${grupoOff.origenes}`)
assert.equal(grupoOff.cantidad, 3, 'solo la diferencia que la venta no pudo cubrir')
assert.equal(await stockDe(productoOff), 0, 'se descontó lo disponible; la necesidad no repone stock sola')

// 3) Reserva con faltante: reserva lo existente y pide solo la diferencia.
const serial = `F1R${String(Date.now()).slice(-9)}`
const productoRes = await req('/api/products', 'POST', { name: `F1 reserva ${sufijo}`, sku: `F1R-${sufijo}`, pricePyg: 800000, costPyg: 500000, stock: 1, branchId: rama, imei: serial }, 201)
const reserva = await req('/api/inventory-reservations', 'POST', { serials: [serial], productId: productoRes.id, quantity: 3, minutes: 60, customerId: cliente.id }, 201)
assert.equal(Array.isArray(reserva) ? reserva.length : 0, 1, 'se reservó la unidad existente')
const panelRes = await req(`/api/supply/needs?productId=${productoRes.id}`)
const grupoRes = (panelRes.grupos || []).find((fila) => fila.productoId === productoRes.id)
assert.ok(grupoRes, 'la reserva con faltante dejó su necesidad')
assert.equal(grupoRes.cantidad, 2, 'solo la diferencia faltante')
assert.ok(grupoRes.origenes.includes('RESERVATION_NO_STOCK'), `la fuente es RESERVATION_NO_STOCK: ${grupoRes.origenes}`)

// 4) Reserva de una unidad existente: no genera compra (y el pedido redundante
// de faltante se rechaza con un mensaje claro).
const serialOk = `F1S${String(Date.now()).slice(-9)}`
const productoResOk = await req('/api/products', 'POST', { name: `F1 reserva justa ${sufijo}`, sku: `F1S-${sufijo}`, pricePyg: 800000, costPyg: 500000, stock: 1, branchId: rama, imei: serialOk }, 201)
await req('/api/inventory-reservations', 'POST', { serials: [serialOk], minutes: 60 }, 201)
const panelResOk = await req(`/api/supply/needs?productId=${productoResOk.id}`)
assert.equal((panelResOk.grupos || []).length, 0, 'reservar la unidad existente no genera compra')
const faltanteRedundante = await fetch(`${base}/api/inventory-reservations`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ serials: [serialOk], productId: productoResOk.id, quantity: 1, minutes: 60 }),
})
assert.equal(faltanteRedundante.status, 400, 'pedir faltante cuando los seriales ya cubren la cantidad se rechaza')
checks++

console.log(`PASS: vínculo venta/reserva → necesidad sin crear stock · ${checks} chequeos`)
