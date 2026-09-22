import assert from 'node:assert/strict'

// #148 §19 — la valuación del equipo recibido (canje, con su grado y su valor)
// tiene que impactar el costo real y el margen: al publicar el trade-in a stock
// el producto queda con costo = valor pagado + reparaciones, y la venta
// posterior congela costo + seguro (costo real = costo + seguro, #162/#160).
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

const sufijo = Date.now().toString(36).toUpperCase()
const serial = `990${Date.now().toString().slice(-12)}`
const valorCanje = 900000
const reparaciones = 150000
const precioLista = 2500000
const costoEsperado = valorCanje + reparaciones
const tasaSeguro = 10

// 1) Venta con el equipo recibido como parte de pago (valor sugerido por grado).
const productoCanje = await req('/api/products', 'POST', { name: `Equipo recibido ${sufijo}`, sku: `CANJE-${sufijo}`, pricePyg: valorCanje, stock: 1 }, 201)
await req('/api/orders', 'POST', {
  items: [{ productId: productoCanje.id, description: 'Equipo recibido', quantity: 1, unitPricePyg: valorCanje }],
  payments: [{ method: 'TRADE_IN', amountPyg: valorCanje, status: 'CONFIRMED', tradeIn: { model: 'iPhone 13 Pro', serial, conditionNotes: 'Grado B · tapa con marcas' } }],
}, 201)

// 2) El equipo entra al taller y se le suman reparaciones.
const [device] = await req(`/api/trade-ins?q=${serial}`)
assert.ok(device, 'el equipo recibido aparece en trade-ins')
assert.equal(Number(device.valuePyg), valorCanje, 'el valor pagado es el de la valuación')
await req('/api/trade-ins', 'PATCH', { id: device.id, status: 'REVIEW' })
await req('/api/trade-ins', 'PATCH', { id: device.id, status: 'REPAIR', repairCostPyg: reparaciones })
await req('/api/trade-ins', 'PATCH', { id: device.id, status: 'READY' })

// 3) Se publica a stock: el producto nace con el costo pagado + reparaciones.
const publicado = await req('/api/trade-ins', 'PATCH', { id: device.id, status: 'STOCK', pricePyg: precioLista, destination: 'NORMAL' })
const productoStock = publicado.product
assert.ok(productoStock?.id, 'el trade-in publicado crea el producto de stock')

// 4) Se vende a un cliente con seguro: costo real = costo + seguro.
const cliente = await req('/api/customers', 'POST', { name: `Cliente seguro ${sufijo}`, firstName: 'Cliente', email: `seguro-${sufijo.toLowerCase()}@test.local`, insuranceEnabled: true, insuranceRatePct: tasaSeguro }, 201)
const venta = await req('/api/orders', 'POST', {
  customerId: cliente.id,
  items: [{ productId: productoStock.id, description: productoStock.name, quantity: 1, unitPricePyg: precioLista }],
  payments: [{ method: 'TRANSFER', amountPyg: precioLista, status: 'CONFIRMED' }],
}, 201)
const linea = venta.items?.[0]
assert.ok(linea, 'la venta devuelve la línea')
const seguroEsperado = Math.round((costoEsperado * tasaSeguro) / 100)
assert.equal(Number(linea.baseUnitCostPyg), costoEsperado, 'el costo del equipo (valor + reparaciones) tiene que llegar a la venta')
assert.equal(Number(linea.insurancePyg), seguroEsperado, 'el seguro se calcula sobre ese costo')
assert.equal(Number(linea.unitCostPyg), costoEsperado + seguroEsperado, 'costo real = costo + seguro')
assert.equal(linea.costPending, false, 'la línea no queda con costo pendiente')

console.log(`PASS: trade-in con costo ${costoEsperado} y seguro ${seguroEsperado} (costo real ${costoEsperado + seguroEsperado}) · ${checks} chequeos`)
