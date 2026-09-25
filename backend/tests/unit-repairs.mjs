import assert from 'node:assert/strict'

// #240 · repuestos no-OEM: el costo de una orden de servicio se pasa al costo
// real de la unidad del stock (vínculo orden ↔ unidad, aplicado una sola vez).
const [baseUrl, adminToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: unit-repairs.mjs <baseUrl> <adminToken>')

async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const marca = Date.now()
const serial = `REPAIR-IMEI-${marca}`
const normalizedSerial = serial.replace(/[\s-]+/g, '').toUpperCase()
const sku = `REPAIR-SKU-${marca}`

let result = await request('/api/products', 'POST', { sku, name: 'Equipo serializado con reparación', pricePyg: 1200000, costPyg: 900000, stock: 1, branchId: 'branch-a-it', imei: serial })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const producto = result.payload

result = await request('/api/service-orders', 'POST', {
  customerName: 'Cliente reparación IT',
  device: 'Equipo serializado con reparación',
  serial,
  status: 'ENTREGADO',
  partsPyg: 100000,
  laborPyg: 20000,
  otherCostPyg: 5000,
})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const orden = result.payload
assert.equal(orden.costPyg, 125000, 'El costo de la orden suma repuestos + mano de obra + otros.')

result = await request(`/api/inventory-units?branchId=branch-a-it&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const unidad = result.payload.find(fila => fila.serial === normalizedSerial)
assert.ok(unidad, 'La unidad con ese serial debe existir en el stock.')

// Pasar el costo al equipo: el gasto entra al costo real de la unidad.
result = await request(`/api/inventory-units/${unidad.id}/repairs`, 'POST', { serviceOrderId: orden.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.montoPyg, 125000)
assert.equal(result.payload.costoRepuestosPyg, 125000, 'El costo de la reparación se suma al costo de repuestos de la unidad.')

// Se aplica una sola vez por orden (dos clics no duplican el costo).
result = await request(`/api/inventory-units/${unidad.id}/repairs`, 'POST', { serviceOrderId: orden.id })
assert.equal(result.response.status, 409, 'La segunda aplicación debe rechazarse.')

// La unidad guarda el costo y la referencia en su inspección.
result = await request(`/api/inventory-units?branchId=branch-a-it&q=${encodeURIComponent(serial)}`)
const reparada = result.payload.find(fila => fila.serial === normalizedSerial)
assert.equal(Number(reparada.inspection?.costoRepuestosPyg), 125000)
assert.match(String(reparada.inspection?.repuestosNoOem || ''), /Reparación|Reparacion|OS-/, 'La inspección deja la referencia de la orden.')

// La cronología del serial muestra la reparación aplicada.
result = await request(`/api/inventory-units/${unidad.id}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const reparacion = (result.payload.events || []).find(evento => evento.type === 'repair' && evento.id === orden.id)
assert.ok(reparacion, 'La cronología lista la orden de servicio del serial.')
assert.equal(reparacion.costPyg, 125000)
assert.ok(reparacion.repairsAppliedAt, 'La reparación aplicada queda marcada con su fecha.')

// La orden queda vinculada a la unidad.
result = await request('/api/service-orders?q=' + encodeURIComponent(normalizedSerial))
const ordenVinculada = (Array.isArray(result.payload) ? result.payload : result.payload.rows || []).find(fila => fila.id === orden.id)
assert.ok(ordenVinculada, 'La orden debe seguir en el listado del taller.')
assert.equal(ordenVinculada.inventoryUnitId, unidad.id, 'La orden guarda la unidad a la que se aplicó el costo.')

// Una orden sin costo no se aplica (evita sumar 0 en silencio).
const sinCosto = await request('/api/service-orders', 'POST', { customerName: 'Cliente sin costo', device: 'Equipo sin costo', serial, costPyg: 0 })
assert.equal(sinCosto.response.status, 201, JSON.stringify(sinCosto.payload))
result = await request(`/api/inventory-units/${unidad.id}/repairs`, 'POST', { serviceOrderId: sinCosto.payload.id })
assert.equal(result.response.status, 400, 'Una orden sin costo cargado no se aplica.')

// Una orden con otro serial no se aplica a esta unidad.
const otroSerial = await request('/api/service-orders', 'POST', { customerName: 'Cliente otro serial', device: 'Equipo otro serial', serial: `${serial}-OTRO`, partsPyg: 5000 })
assert.equal(otroSerial.response.status, 201, JSON.stringify(otroSerial.payload))
result = await request(`/api/inventory-units/${unidad.id}/repairs`, 'POST', { serviceOrderId: otroSerial.payload.id })
assert.equal(result.response.status, 409, 'Una orden de otro serial no se aplica a esta unidad.')

console.log('unit-repairs: OK (vínculo orden ↔ unidad, costo único, cronología y rechazos)')
