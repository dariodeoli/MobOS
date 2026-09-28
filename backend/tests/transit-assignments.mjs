import assert from 'node:assert/strict'

// #279 (A4) · Vender en tránsito: una unidad que viaja se aparta para una venta
// (bloqueada para otras: no hay doble asignación), al recibirla el IMEI se
// vincula solo al pedido que la esperaba y el vendedor recibe la novedad en la
// bandeja interna. Corre contra el seed del arnés (vendedor de la sucursal A).
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
const ramaA = 'branch-a-it'
const ramaA2 = 'branch-a2-it'
const productoA2 = 'prod-a-crossbranch-it'
const serial = `ZZA4${sufijo}`
const serial2 = `ZZA4B${sufijo}`

// Prepara una unidad que viaja de A2 a A (el vendedor la recibe).
async function unidadEnTransito(serialUnidad) {
  await req('/api/inventory-units', 'POST', { productId: productoA2, serial: serialUnidad, branchId: ramaA2 }, 201)
  const transferencia = await req('/api/transfers', 'POST', { sourceBranchId: ramaA2, destinationBranchId: ramaA, lines: [{ productId: productoA2, quantity: 1, serials: [serialUnidad] }] }, 201)
  const linea = transferencia.lines[0]
  const unidades = await req(`/api/inventory-units?q=${encodeURIComponent(serialUnidad)}`)
  const filas = Array.isArray(unidades) ? unidades : unidades.items || []
  const unidad = filas.find((fila) => fila.serial === serialUnidad)
  assert.ok(unidad, `la unidad viaja en tránsito: ${JSON.stringify(unidades).slice(0, 200)}`)
  assert.equal(unidad.status, 'IN_TRANSIT')
  return { unidad, destinoProductoId: linea.destinationProduct.id, transferencia }
}

// 1) El vendedor aparta la unidad futura para su venta (pedido en firme).
const viaje = await unidadEnTransito(serial)
const pedido = await req('/api/orders', 'POST', {
  orderNumber: `A4-${sufijo}`,
  items: [{ productId: viaje.destinoProductoId, description: `A4 ${sufijo}`, quantity: 1, unitPricePyg: 1000000, backorder: true }],
  payment: { method: 'CASH', amountPyg: 1000000 },
}, 201, seller)
const asignacion = await req('/api/transit-assignments', 'POST', { serial, orderId: pedido.id, orderItemId: pedido.items[0].id, customerName: 'Cliente A4' }, 201, seller)
assert.equal(asignacion.asignacion.status, 'ASIGNADA')
assert.equal(asignacion.asignacion.orderId, pedido.id)
assert.equal(asignacion.asignacion.serial, serial)

// 2) Bloqueada para otros: el segundo intento no puede doble-asignar ESA unidad.
await req('/api/transit-assignments', 'POST', { serial }, 409, seller)
await req('/api/transit-assignments', 'POST', { serial }, 409, admin)
const listado = await req(`/api/transit-assignments?q=${encodeURIComponent(serial)}`, 'GET', undefined, 200, seller)
assert.equal(listado.asignaciones.length, 1, 'una sola asignación viva por unidad')
// La unidad viaja con la asignación a la vista del panel.
const unidadConAsignacion = (await req(`/api/inventory-units?q=${encodeURIComponent(serial)}`)).find((fila) => fila.serial === serial)
assert.equal(unidadConAsignacion?.transitAssignment?.status, 'ASIGNADA', 'la unidad trae su asignación viva')

// 3) No se puede apartar una unidad que ya está en stock (solo futuras).
await req('/api/inventory-units/verify', 'POST', { serial, locationId: null }, 200, seller)
await req('/api/transit-assignments', 'POST', { serial }, 400, seller)

// 4) Al recibirla, el IMEI se vincula solo al pedido y queda reservada.
const recibida = (await req(`/api/inventory-units?q=${encodeURIComponent(serial)}`)).find((fila) => fila.serial === serial)
assert.equal(recibida.status, 'RESERVED', 'la unidad llega reservada a la venta que la esperaba')
assert.equal(recibida.reservationCustomer, 'Cliente A4')
const vinculada = (await req(`/api/transit-assignments?q=${encodeURIComponent(serial)}`, 'GET', undefined, 200, seller)).asignaciones[0]
assert.equal(vinculada.status, 'VINCULADA', 'la asignación queda vinculada')
assert.ok(vinculada.linkedAt, 'con fecha de vínculo')
const conSerial = await req(`/api/orders/${encodeURIComponent(pedido.id)}`, 'GET', undefined, 200, seller)
assert.ok(JSON.stringify(conSerial).includes(serial), 'el pedido recibió su IMEI al llegar la unidad')

// 5) Notificación en la bandeja del vendedor.
const notificaciones = await req('/api/notifications', 'GET', undefined, 200, seller)
const aviso = (notificaciones.items || []).find((item) => item.kind === 'TRANSITO' && String(item.detail || '').includes(serial))
assert.ok(aviso, `el vendedor ve la llegada de su equipo: ${JSON.stringify((notificaciones.items || []).map((i) => i.kind))}`)
assert.equal(aviso.title, 'Llegó el equipo que apartaste')
assert.equal(aviso.href, `/pedidos/${pedido.id}`)

// 6) Liberar y volver a apartar: el candado es solo para la asignación viva.
const viaje2 = await unidadEnTransito(serial2)
const primera = await req('/api/transit-assignments', 'POST', { serial: serial2, customerName: 'Cliente A4 bis' }, 201, seller)
await req('/api/transit-assignments', 'PATCH', { id: primera.asignacion.id, action: 'release' }, 200, seller)
const segunda = await req('/api/transit-assignments', 'POST', { serial: serial2, customerName: 'Cliente A4 bis' }, 201, seller)
assert.notEqual(segunda.asignacion.id, primera.asignacion.id, 'tras liberar se puede volver a apartar')
const historial = await req(`/api/transit-assignments?q=${encodeURIComponent(serial2)}`, 'GET', undefined, 200, seller)
assert.equal(historial.asignaciones.length, 2, 'el historial conserva la asignación liberada')
// Recibida sin pedido: queda reservada a nombre de quien la apartó.
await req('/api/inventory-units/verify', 'POST', { serial: serial2, locationId: null }, 200, seller)
const recibida2 = (await req(`/api/inventory-units?q=${encodeURIComponent(serial2)}`)).find((fila) => fila.serial === serial2)
assert.equal(recibida2.status, 'RESERVED')
assert.equal(recibida2.reservationCustomer, 'Cliente A4 bis')

// Limpieza: liberar reservas y dar de baja las unidades del arnés.
await req('/api/inventory-reservations', 'PATCH', { action: 'release', serials: [serial, serial2] }, 200, seller)
for (const serialUnidad of [serial, serial2]) {
  const filas = await req(`/api/inventory-units?q=${encodeURIComponent(serialUnidad)}`)
  const unidad = filas.find((fila) => fila.serial === serialUnidad)
  if (unidad) await req('/api/inventory-units', 'PATCH', { id: unidad.id, action: 'remove', reason: 'Limpieza A4' })
}
void viaje2

console.log(`PASS: vender en tránsito — asignación bloqueada, vínculo del IMEI al recibir y aviso al vendedor · ${checks} chequeos`)
