import assert from 'node:assert/strict'

// Abastecimiento F1 (#254, dominio clientes) — el cliente en la tarjeta de
// necesidad: la venta sobre pedido deja la necesidad vinculada con su cliente;
// quien puede gestionar clientes ve el nombre y quien no ve el vínculo con
// `clienteOculto`. Corre contra el seed del arnés (base + token admin + token
// de empresa para iniciar sesión como comprador con permisos recortados).
const [base, admin, company] = process.argv.slice(2)
if (!base || !admin || !company) throw new Error('base, token admin y token de empresa requeridos')
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

// 1) Venta sobre pedido: el motor de F1 deja la necesidad con el cliente.
const producto = await req('/api/products', 'POST', { name: `Cliente permiso ${sufijo}`, sku: `CPE-${sufijo}`, pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: rama }, 201)
const cliente = await req('/api/customers', 'POST', { name: `Cliente Permiso ${sufijo}` }, 201)
const pedido = await req('/api/orders', 'POST', {
  orderNumber: `CPE-${sufijo}`,
  customerId: cliente.id,
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 100000, backorder: true }],
  payment: { method: 'CASH', amountPyg: 50000 },
}, 201)

const vistaAdmin = await req(`/api/supply/needs?productId=${producto.id}`)
const grupoAdmin = (vistaAdmin.grupos || []).find((fila) => fila.productoId === producto.id)
assert.ok(grupoAdmin, 'la venta pendiente deja su grupo en «Por comprar»')
assert.ok(grupoAdmin.origenes.includes('SALE_NO_STOCK'), `la fuente esperada es SALE_NO_STOCK: ${grupoAdmin.origenes}`)
const destinoAdmin = (grupoAdmin.destinos || []).find((fila) => fila.pedidoId === pedido.id)
assert.ok(destinoAdmin, 'la necesidad conserva el pedido original')
assert.equal(destinoAdmin.pedidoNumero, pedido.orderNumber)
assert.equal(destinoAdmin.clienteId, cliente.id, 'el cliente queda vinculado por id')
assert.equal(destinoAdmin.cliente, `Cliente Permiso ${sufijo}`, 'quien puede gestionar clientes ve el nombre')
assert.equal(destinoAdmin.clienteOculto, false, 'con nombre visible no se marca oculto')

// 2) Comprador con permisos recortados: mismo panel, sin datos del cliente.
const comprador = await req('/api/users', 'POST', {
  name: `Comprador ${sufijo}`,
  role: 'GERENTE',
  pin: '9753',
  permissions: ['stock:manage', 'purchases:manage', 'products:read', 'stock:read'],
}, 201)
const loginRespuesta = await fetch(`${base}/api/auth/pin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${company}` },
  body: JSON.stringify({ sellerId: comprador.id, pin: '9753' }),
})
assert.equal(loginRespuesta.status, 200, 'el comprador inicia sesión con su PIN')
checks++
const cookieComprador = (loginRespuesta.headers.getSetCookie?.() || []).map((cookie) => cookie.split(';')[0]).find((cookie) => cookie.startsWith('mobos_seller_session='))
assert.ok(cookieComprador, 'el login del comprador trae su cookie')
const tokenComprador = cookieComprador.split('=')[1]

const vistaComprador = await req(`/api/supply/needs?productId=${producto.id}`, 'GET', undefined, 200, tokenComprador)
const grupoComprador = (vistaComprador.grupos || []).find((fila) => fila.productoId === producto.id)
assert.ok(grupoComprador, 'el comprador ve la misma demanda')
const destinoComprador = (grupoComprador.destinos || []).find((fila) => fila.pedidoId === pedido.id)
assert.ok(destinoComprador, 'el destino conserva el pedido para el comprador')
assert.equal(destinoComprador.clienteId, cliente.id, 'el vínculo con el cliente viaja igual')
assert.equal(destinoComprador.cliente, null, 'sin permiso de clientes no se expone el nombre')
assert.equal(destinoComprador.clienteOculto, true, 'la tarjeta sabe que hay un cliente detrás')

console.log(`PASS: cliente con permiso en la tarjeta de necesidad · ${checks} chequeos`)
