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

// 4) Repuestos detectados en la inspección PhoneCheck (#240): el costo cargado
//    en la inspección (no-OEM / arreglos) también suma al costo real del equipo.
const serialInsp = `992${Date.now().toString().slice(-12)}`
const costoInspBase = 800000
const costoRepuestosInsp = 120000
const precioInsp = 1500000
const productoInsp = await req('/api/products', 'POST', { name: `Equipo inspeccionado ${sufijo}`, sku: `INSP-${sufijo}`, pricePyg: precioInsp, costPyg: costoInspBase, stock: 1, imei: serialInsp, branchId: rama, condition: 'USED' }, 201)
const unidadesInsp = await req(`/api/inventory-units?q=${serialInsp}&branchId=${rama}`)
const listaInsp = Array.isArray(unidadesInsp) ? unidadesInsp : unidadesInsp.units || []
const unidadInsp = listaInsp.find((fila) => fila.serial === serialInsp)
assert.ok(unidadInsp, 'la unidad inspeccionada aparece en Inventario')
await req('/api/inventory-units', 'PATCH', {
  id: unidadInsp.id,
  action: 'inspection',
  inspection: { items: [{ clave: 'pantalla', estado: 'falla', nota: 'Pantalla no OEM' }], repuestosNoOem: 'Pantalla no original', costoRepuestosPyg: costoRepuestosInsp },
})
const ventaInsp = await req('/api/orders', 'POST', {
  customerId: cliente.id,
  branchId: rama,
  items: [{ productId: productoInsp.id, description: productoInsp.name, quantity: 1, unitPricePyg: precioInsp, inventoryUnitSerials: [serialInsp] }],
  payments: [{ method: 'TRANSFER', amountPyg: precioInsp, status: 'CONFIRMED' }],
}, 201)
const lineaInsp = ventaInsp.items?.[0]
const costoRealInsp = costoInspBase + costoRepuestosInsp
const seguroInsp = Math.round((costoRealInsp * tasaSeguro) / 100)
assert.equal(Number(lineaInsp.baseUnitCostPyg), costoRealInsp, 'el costo de repuestos de la inspección tiene que sumar al costo base')
assert.equal(Number(lineaInsp.insurancePyg), seguroInsp, 'el seguro se calcula sobre el costo con repuestos')
assert.equal(Number(lineaInsp.unitCostPyg), costoRealInsp + seguroInsp, 'costo real = unidad + repuestos de inspección + seguro')

console.log(`PASS: inspección no-OEM con repuestos ${costoRepuestosInsp} → costo real ${costoRealInsp} · seguro ${seguroInsp} · ${checks} chequeos`)

// 5) Equipo en consignación (#33): no es de la tienda; al venderse se le paga
//    al consignador el monto acordado. Ese monto es costo real de la venta.
const serialConsig = `993${Date.now().toString().slice(-12)}`
const precioConsig = 1800000
const consignorPyg = 1500000
const productoConsig = await req('/api/products', 'POST', { name: `Equipo consignado ${sufijo}`, sku: `CONS-${sufijo}`, pricePyg: precioConsig, stock: 1, imei: serialConsig, branchId: rama, condition: 'USED' }, 201)
const unidadesConsig = await req(`/api/inventory-units?q=${serialConsig}&branchId=${rama}`)
const listaConsig = Array.isArray(unidadesConsig) ? unidadesConsig : unidadesConsig.units || []
const unidadConsig = listaConsig.find((fila) => fila.serial === serialConsig)
assert.ok(unidadConsig, 'la unidad consignada aparece en Inventario')
await req('/api/inventory-units', 'PATCH', { id: unidadConsig.id, action: 'details', consignorName: 'Tercero demo', consignorPyg })
const ventaConsig = await req('/api/orders', 'POST', {
  customerId: cliente.id,
  branchId: rama,
  items: [{ productId: productoConsig.id, description: productoConsig.name, quantity: 1, unitPricePyg: precioConsig, inventoryUnitSerials: [serialConsig] }],
  payments: [{ method: 'TRANSFER', amountPyg: precioConsig, status: 'CONFIRMED' }],
}, 201)
const lineaConsig = ventaConsig.items?.[0]
const seguroConsig = Math.round((consignorPyg * tasaSeguro) / 100)
assert.equal(Number(lineaConsig.baseUnitCostPyg), consignorPyg, 'lo que se paga al consignador es el costo real de la venta')
assert.equal(Number(lineaConsig.insurancePyg), seguroConsig, 'el seguro se calcula sobre ese costo')
assert.equal(Number(lineaConsig.unitCostPyg), consignorPyg + seguroConsig, 'costo real = consignación + seguro')

console.log(`PASS: consignación ${consignorPyg} → costo real ${consignorPyg} · seguro ${seguroConsig} · ${checks} chequeos`)
