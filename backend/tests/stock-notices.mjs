import assert from 'node:assert/strict'

// #280 · Aviso de INV al vendedor (cross-dominio INV→POS): cuando cambia el
// stock o la disponibilidad de un producto comprometido (una venta sin stock),
// el vendedor recibe la novedad en la bandeja interna. Registro: la auditoría
// del inventario. Sin spam: un aviso por pedido y producto, solo el último
// cambio y solo si invierte la disponibilidad; el cambio propio no avisa.
//
// Corre contra el seed del arnés: vendedor de la sucursal A + admin.
const [base, seller, admin] = process.argv.slice(2)
if (!base || !seller || !admin) throw new Error('base, token del vendedor y token admin requeridos')
let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

const sufijo = Date.now().toString(36).toUpperCase()
const rama = 'branch-a-it'
const serial = `STK${String(Date.now()).slice(-9)}`
const avisosDe = async () => (await req('/api/notifications', 'GET', undefined, 200, seller)).items.filter((item) => item.kind === 'STOCK' || item.kind === 'SIN_STOCK')

// 1) Venta sin stock: la necesidad queda comprometida (motor F1) y todavía no
//    hay ningún aviso de stock (no cambió nada desde el compromiso).
const producto = await req('/api/products', 'POST', { name: `Aviso stock ${sufijo}`, sku: `STK-${sufijo}`, pricePyg: 1500000, costPyg: 1000000, stock: 0, branchId: rama }, 201)
const pedido = await req('/api/orders', 'POST', {
  orderNumber: `STK-${sufijo}`,
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 1500000, backorder: true }],
  payment: { method: 'CASH', amountPyg: 1500000 },
}, 201, seller)
const antes = await avisosDe()
assert.equal(antes.filter((item) => item.id === `stock-${pedido.id}-${producto.id}`).length, 0, 'sin cambios no hay aviso')

// 2) Llega la unidad (INV): el vendedor recibe «Ya hay stock para tu pedido».
const unidad = await req('/api/inventory-units', 'POST', { productId: producto.id, serial, branchId: rama, condition: 'NEW' }, 201)
const conLlegada = await avisosDe()
const llegada = conLlegada.find((item) => item.id === `stock-${pedido.id}-${producto.id}`)
assert.ok(llegada, `el aviso de llegada llegó al vendedor: ${JSON.stringify(conLlegada)}`)
assert.equal(llegada.kind, 'STOCK')
assert.equal(llegada.title, 'Ya hay stock para tu pedido')
assert.match(llegada.detail, /Aviso stock/)
assert.match(llegada.detail, new RegExp(`STK-${sufijo}`), 'el detalle lleva el pedido')
assert.equal(llegada.href, `/pedidos/${pedido.id}`)
// Sin spam: un solo aviso por pedido y producto, y el registro queda auditado.
assert.equal(conLlegada.filter((item) => item.id === llegada.id).length, 1)
const auditoria = await req('/api/audit?q=INVENTORY_UNIT_RECEIVED&limit=100')
assert.ok(auditoria.some((fila) => fila.entityId === unidad.id), 'la llegada queda en la auditoría (el registro)')

// 3) La baja de esa misma unidad deja el producto sin disponibilidad: el aviso
//    cambia a «quedó sin stock» (el último cambio manda) y sigue siendo uno.
await req('/api/inventory-units', 'PATCH', { id: unidad.id, action: 'remove', reason: 'Prueba #280' }, 200)
const conBaja = await avisosDe()
const baja = conBaja.find((item) => item.id === `stock-${pedido.id}-${producto.id}`)
assert.ok(baja, 'tras la baja sigue habiendo un aviso (el último cambio)')
assert.equal(baja.kind, 'SIN_STOCK')
assert.equal(baja.title, 'Tu pedido quedó sin stock')
assert.match(baja.detail, /se dio de baja lo último disponible/)
assert.equal(conBaja.filter((item) => item.id === baja.id).length, 1, 'sigue siendo un aviso por pedido y producto')

// 4) Lo que llega de otro producto no se mezcla: el compromiso del producto B
//    (sin stock) sigue sin aviso aunque entre stock de otro modelo.
const serialB = `STB${String(Date.now()).slice(-9)}`
const productoB = await req('/api/products', 'POST', { name: `Aviso stock B ${sufijo}`, sku: `STKB-${sufijo}`, pricePyg: 1500000, costPyg: 1000000, stock: 0, branchId: rama }, 201)
const pedidoB = await req('/api/orders', 'POST', {
  orderNumber: `STKB-${sufijo}`,
  items: [{ productId: productoB.id, description: productoB.name, quantity: 1, unitPricePyg: 1500000, backorder: true }],
  payment: { method: 'CASH', amountPyg: 1500000 },
}, 201, seller)
await req('/api/inventory-units', 'POST', { productId: producto.id, serial: serialB, branchId: rama, condition: 'NEW' }, 201)
const otras = await avisosDe()
assert.ok(!otras.some((item) => item.id === `stock-${pedidoB.id}-${productoB.id}`), 'el stock de otro producto no avisa')

console.log(`PASS: aviso INV→vendedor — llegada y baja del producto comprometido, un aviso por pedido · ${checks} chequeos`)
