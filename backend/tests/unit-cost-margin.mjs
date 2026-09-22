import assert from 'node:assert/strict'

// #148 §19 — El costo real/margen de un equipo serializado tiene que salir del
// costo de la UNIDAD (Inventario), donde se cargan reparaciones y repuestos
// (hoy a mano; con el rediseño #240/#241 desde el checklist). Si la venta lleva
// el IMEI/serial, la base es el costo de esa unidad y el seguro se calcula
// sobre ella (costo real = costo + seguro).
// Corre contra el seed del arnés: recibe base y token admin.
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0
async function req(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

const rama = 'branch-a-it'
const sufijo = Date.now().toString(36).toUpperCase()
const serial = `991${Date.now().toString().slice(-12)}`
const costoBase = 1000000
const repuestos = 250000
const costoReal = costoBase + repuestos
const tasaSeguro = 10

// 1) Alta del equipo con IMEI: crea el producto y su unidad en Inventario.
const producto = await req('/api/products', 'POST', { name: `Equipo reparado ${sufijo}`, sku: `REP-${sufijo}`, pricePyg: 2000000, costPyg: costoBase, stock: 1, imei: serial, branchId: rama, condition: 'USED' }, 201)

// 2) La unidad recibe las reparaciones/repuestos detectados (pantalla no OEM,
//    batería) desde el panel de Inventario.
const unidades = await req(`/api/inventory-units?q=${serial}&branchId=${rama}`)
const lista = Array.isArray(unidades) ? unidades : unidades.units || []
const unidad = lista.find((fila) => fila.serial === serial)
assert.ok(unidad, 'la unidad aparece en Inventario')
await req('/api/inventory-units', 'PATCH', { id: unidad.id, action: 'details', costPyg: costoReal, notes: 'Reparación: pantalla no original + batería' })

// 3) Se vende el equipo con seguro: la base del costo es la unidad reparada.
const cliente = await req('/api/customers', 'POST', { name: `Cliente reparado ${sufijo}`, firstName: 'Cliente', insuranceEnabled: true, insuranceRatePct: tasaSeguro }, 201)
const venta = await req('/api/orders', 'POST', {
  customerId: cliente.id,
  branchId: rama,
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 2000000, inventoryUnitSerials: [serial] }],
  payments: [{ method: 'TRANSFER', amountPyg: 2000000, status: 'CONFIRMED' }],
}, 201)
const linea = venta.items?.[0]
assert.ok(linea, 'la venta devuelve la línea')
const seguroEsperado = Math.round((costoReal * tasaSeguro) / 100)
assert.equal(Number(linea.baseUnitCostPyg), costoReal, 'el costo base tiene que ser el de la unidad con reparaciones')
assert.equal(Number(linea.insurancePyg), seguroEsperado, 'el seguro se calcula sobre el costo real de la unidad')
assert.equal(Number(linea.unitCostPyg), costoReal + seguroEsperado, 'costo real = costo de la unidad + seguro')
assert.equal(linea.costPending, false, 'la línea no queda con costo pendiente')

console.log(`PASS: venta por IMEI con costo de unidad ${costoReal} (base ${costoBase} + repuestos ${repuestos}) · seguro ${seguroEsperado} · ${checks} chequeos`)
