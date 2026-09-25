import assert from 'node:assert/strict'

// #250 · Repuestos del taller con tenencia y pago: propios (contado/crédito) y de
// proveedor (consignación en depósito o crédito), dueño explícito, uso por el
// taller, devolución, cuenta por pagar (FIN) y stock vendible intacto.
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
const hoy = new Date()
const vencimiento = new Date(hoy.getTime() + 15 * 86400000).toISOString()
const vencido = new Date(hoy.getTime() - 5 * 86400000).toISOString()

// Contexto: proveedor, depósito (el "Depósito 2" del pedido) y producto de catálogo.
const proveedor = await req('/api/suppliers', 'POST', { name: `Proveedor Repuestos ${sufijo}`, phone: '0981555000' }, 201)
const deposito = await req('/api/stock-locations', 'POST', { branchId: rama, name: `Depósito 2 · ${sufijo}`, code: 'D2' }, 201)
const producto = await req('/api/products', 'POST', { name: `Módulo pantalla ${sufijo}`, sku: `REP-${sufijo}`, pricePyg: 400000, costPyg: 150000, stock: 7, branchId: rama }, 201)
const stockAntes = Number((await req(`/api/products?q=${encodeURIComponent(`REP-${sufijo}`)}`)).find((fila) => fila.id === producto.id)?.stock ?? -1)
const unidadesAntes = (await req(`/api/inventory-units?q=${encodeURIComponent(`REP-${sufijo}`)}`)).length

// 1) Alta de las cuatro combinaciones de tenencia y pago.
const propioContado = await req('/api/workshop/parts', 'POST', {
  name: `Flex ${sufijo}`, ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 2, unitCostPyg: 45000, branchId: rama, locationId: deposito.id,
}, 201)
assert.equal(propioContado.code, 'REP-#0001')
assert.equal(propioContado.paidAt !== null, true, 'lo contado nace pago')
assert.equal(propioContado.status, 'DISPONIBLE')
const propioCredito = await req('/api/workshop/parts', 'POST', {
  name: `Táctil ${sufijo}`, ownership: 'PROPIO', paymentMode: 'CREDITO', quantity: 3, unitCostPyg: 60000, dueAt: vencimiento, branchId: rama,
}, 201)
assert.equal(propioCredito.paidAt, null)
const deProveedor = await req('/api/workshop/parts', 'POST', {
  name: `Cámara ${sufijo}`, ownership: 'PROVEEDOR', paymentMode: 'CONSIGNACION', supplierId: proveedor.id, quantity: 4, unitCostPyg: 90000, locationId: deposito.id, branchId: rama, notes: 'Consignación en Depósito 2',
}, 201)
assert.equal(deProveedor.supplier.id, proveedor.id, 'dueño explícito: el proveedor')
const proveedorCredito = await req('/api/workshop/parts', 'POST', {
  name: `Batería ${sufijo}`, ownership: 'PROVEEDOR', paymentMode: 'CREDITO', supplierId: proveedor.id, quantity: 2, unitCostPyg: 120000, dueAt: vencido, branchId: rama,
}, 201)

// 2) Validaciones de coherencia (dueño y pago).
await req('/api/workshop/parts', 'POST', { name: 'Sin dueño', ownership: 'PROVEEDOR', paymentMode: 'CREDITO', quantity: 1 }, 400, admin)
await req('/api/workshop/parts', 'POST', { name: 'Consignación propia', ownership: 'PROPIO', paymentMode: 'CONSIGNACION', supplierId: proveedor.id, quantity: 1 }, 400, admin)
await req('/api/workshop/parts', 'POST', { name: 'Contado con vencimiento', ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 1, dueAt: vencimiento }, 400, admin)
await req('/api/workshop/parts', 'POST', { name: 'Cantidad inválida', ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 0 }, 400, admin)

// 3) El taller los ve y los usa (el taller no ve el stock vendible mezclado).
const disponibles = await req(`/api/workshop/parts?disponibles=1&branchId=${rama}`)
assert.ok(disponibles.parts.some((part) => part.id === deProveedor.id))
assert.equal(disponibles.resumen.propios >= 2, true)
assert.equal(disponibles.resumen.deProveedor >= 2, true)
const usado = await req('/api/workshop/parts', 'PATCH', { id: deProveedor.id, action: 'use', quantity: 2, note: 'Cambio de cámara en el taller' })
assert.equal(usado.part.quantity, 2, 'descuenta lo usado')
assert.equal(usado.part.usedQuantity, 2)
assert.equal(usado.part.status, 'DISPONIBLE')
assert.equal(usado.deudaPyg, 180000, 'la consignación genera deuda por lo usado')
assert.equal(usado.porPagar, true)
await req('/api/workshop/parts', 'PATCH', { id: propioContado.id, action: 'use', quantity: 5 }, 409, admin)
await req('/api/workshop/parts', 'PATCH', { id: propioContado.id, action: 'return', quantity: 1 }, 409, admin)

// 4) Devolución al proveedor (solo lo del proveedor) y baja con motivo.
const devuelto = await req('/api/workshop/parts', 'PATCH', { id: deProveedor.id, action: 'return', quantity: 2, note: 'Vuelve al proveedor sin usar' })
assert.equal(devuelto.part.quantity, 0)
assert.equal(devuelto.part.status, 'DEVUELTO')
await req('/api/workshop/parts', 'PATCH', { id: propioCredito.id, action: 'baja', quantity: 1 }, 400, admin)
await req('/api/workshop/parts', 'PATCH', { id: propioCredito.id, action: 'baja', quantity: 3, note: 'Se rompió al desarmar' }, 200)

// 5) Cuenta por pagar (lo que mira FIN) y pago.
const porPagar = await req('/api/workshop/parts?porPagar=1')
const ids = porPagar.parts.map((part) => part.id)
assert.ok(ids.includes(propioCredito.id), 'el crédito propio está por pagar')
assert.ok(ids.includes(proveedorCredito.id), 'el crédito del proveedor está por pagar')
assert.equal(porPagar.resumen.vencidas >= 1, true, 'el vencido se cuenta aparte')
assert.ok(porPagar.resumen.porPagarPyg >= 180000 + 240000)
const pagado = await req('/api/workshop/parts', 'PATCH', { id: propioCredito.id, action: 'pay', note: 'Transferencia al proveedor' })
assert.equal(pagado.part.paidAt !== null, true)
assert.equal(pagado.porPagar, false)
await req('/api/workshop/parts', 'PATCH', { id: propioCredito.id, action: 'pay' }, 409, admin)
const trasPago = await req('/api/workshop/parts?porPagar=1')
assert.equal(trasPago.parts.some((part) => part.id === propioCredito.id), false)

// 6) Trazabilidad: movimientos del repuesto y auditoría de las acciones.
const detalle = await req(`/api/workshop/parts?id=${deProveedor.id}`)
assert.deepEqual(detalle.part.movements.map((movimiento) => movimiento.kind), ['DEVOLUCION', 'USO', 'ALTA'])
for (const action of ['WORKSHOP_PART_CREATED', 'WORKSHOP_PART_USED', 'WORKSHOP_PART_RETURNED', 'WORKSHOP_PART_PAID', 'WORKSHOP_PART_DISCARDED']) {
  const auditoria = await req(`/api/audit?action=${action}&limit=5`)
  const filas = Array.isArray(auditoria) ? auditoria : auditoria?.entradas || auditoria?.rows || []
  assert.ok(filas.length >= 1, `la auditoría registra ${action}`)
}

// 7) El stock vendible queda intacto (ni Product.stock ni InventoryUnit).
const stockDespues = Number((await req(`/api/products?q=${encodeURIComponent(`REP-${sufijo}`)}`)).find((fila) => fila.id === producto.id)?.stock ?? -1)
assert.equal(stockDespues, stockAntes, 'el stock vendible no cambia con los repuestos')
assert.equal((await req(`/api/inventory-units?q=${encodeURIComponent(`REP-${sufijo}`)}`)).length, unidadesAntes, 'no se crean unidades de inventario')

// 8) Permisos.
await req('/api/workshop/parts', 'GET', undefined, 401, 'token-invalido')
await req('/api/workshop/parts', 'POST', { name: 'Sin permiso', ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 1 }, 403, vendedor)
await req('/api/workshop/parts', 'PATCH', { id: propioContado.id, action: 'pay' }, 403, vendedor)

console.log(`PASS: repuestos del taller — 4 altas (propio contado/crédito, proveedor consignación/crédito), uso ${usado.part.usedQuantity} en el taller, devolución, baja, deuda ${porPagar.resumen.porPagarPyg} Gs (${porPagar.resumen.vencidas} vencida), pago y stock vendible intacto · ${checks} chequeos`)
