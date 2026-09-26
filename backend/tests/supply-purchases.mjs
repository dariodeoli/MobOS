import assert from 'node:assert/strict'

// #250 Fase 2 — Compra rápida del Centro de Abastecimiento: registrar cantidades
// compradas, proveedor, costo/moneda, referencia e IMEI (ahora o pendientes),
// cubrir necesidades y la compra adicional como reposición libre. Regla dura:
// **nada pasa a stock disponible antes de la recepción**.
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
const imeiA = '490154203237518'
const imeiB = '490154203237526'

// 1) Producto con stock 0 y una necesidad manual que la compra va a cubrir.
const producto = await req('/api/products', 'POST', { name: `Compra A ${sufijo}`, sku: `CMP-A-${sufijo}`, pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: rama }, 201)
const necesidad = await req('/api/supply/needs', 'POST', { productId: producto.id, quantity: 1, branchId: rama, priority: 'ALTA', notes: 'Pedido sin stock' }, 201)

// 2) Compra en USD con referencia y la factura se adjunta después (otra API).
const compra = await req('/api/supply/purchases', 'POST', {
  supplierName: `Proveedor Compra ${sufijo}`,
  currency: 'USD',
  originalCost: 350.5,
  exchangeRatePyg: 7500,
  reference: `FAC-${sufijo}`,
  lines: [
    { needId: necesidad.id, productId: producto.id, quantity: 1, serials: imeiA },
    { productId: producto.id, quantity: 2, unitCostPyg: 2500000 },
  ],
}, 201)
assert.equal(compra.status, 'COMPRADA')
assert.ok(/^COM-CDE-\d{4}$/.test(compra.code), `código compartido inesperado: ${compra.code}`)
assert.equal(Number(compra.costPyg), Math.round(350.5 * 7500), 'el total en Gs sale de la cotización')
assert.equal(compra.lines.length, 2)
const lineaConImei = compra.lines.find((linea) => linea.needId === necesidad.id)
assert.ok(lineaConImei && lineaConImei.serials.length === 1, 'la línea que cubre la necesidad trae su IMEI')
const lineaAdicional = compra.lines.find((linea) => !linea.needId)
assert.ok(lineaAdicional && lineaAdicional.serials.length === 0, 'la compra adicional puede ir con IMEI pendiente')

// 2-bis) FIN (#254): costo por línea en la moneda de la compra. La línea trae
// "USD 900 c/u" y el total de la compra se deriva de las líneas.
const compraPorLinea = await req('/api/supply/purchases', 'POST', {
  supplierName: 'Proveedor USD',
  currency: 'USD',
  exchangeRatePyg: 7500,
  lines: [
    { productId: producto.id, quantity: 2, originalUnitCost: 900 },
    { productId: producto.id, quantity: 1, originalUnitCost: 700.5, unitCostPyg: 5000000 },
  ],
}, 201)
assert.equal(Number(compraPorLinea.lines[0].unitCostPyg), Math.round(900 * 7500), 'la línea convierte su costo en USD')
assert.equal(Number(compraPorLinea.lines[0].originalUnitCost), 900, 'el costo original de la línea se conserva')
assert.equal(Number(compraPorLinea.lines[1].unitCostPyg), 5000000, 'el Gs explícito manda sobre el original')
assert.equal(Number(compraPorLinea.costPyg), Math.round(900 * 7500) * 2 + 5000000, 'sin total explícito, el total es la suma de las líneas')
assert.equal(Number(compraPorLinea.originalCost), Number((900 * 2 + 700.5).toFixed(2)), 'el total original suma lo cargado en origen')
// Falta de cotización con costo por línea en moneda extranjera.
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', currency: 'USD', lines: [{ productId: producto.id, quantity: 1, originalUnitCost: 900 }] }, 400)

// 3) La necesidad quedó cubierta y vinculada a la compra.
const pendientes = await req('/api/supply/needs')
assert.ok(!pendientes.grupos.some((grupo) => grupo.necesidades.includes(necesidad.id)), 'la necesidad cubierta sale de «Por comprar»')
const cubiertas = await req('/api/supply/needs?status=COMPRADA')
assert.ok(cubiertas.grupos.some((grupo) => grupo.necesidades.includes(necesidad.id)), 'la necesidad aparece como COMPRADA')

// 4) Regla dura: la compra no mueve stock (sigue en 0 hasta la recepción).
const stock = await req(`/api/stock?branchId=${rama}`)
const filaStock = (Array.isArray(stock) ? stock : stock.productos || []).find((item) => item.id === producto.id)
assert.equal(Number(filaStock?.stock ?? 0), 0, 'el stock no puede moverse antes de la recepción')

// 5) IMEI: duplicado en otra compra y ya presente en el inventario.
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', lines: [{ productId: producto.id, quantity: 1, serials: imeiA }] }, 409)
await req('/api/inventory-units', 'POST', { productId: producto.id, branchId: rama, serial: imeiB, condition: 'NEW' }, 201)
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', lines: [{ productId: producto.id, quantity: 1, serials: imeiB }] }, 409)
// Referencia: la unidad cargada suma stock propio (ajeno a la compra).
const stockConUnidad = (filaStock) => Number(filaStock?.stock ?? 0)
const trasUnidad = await req(`/api/stock?branchId=${rama}`)
const stockReferencia = stockConUnidad((Array.isArray(trasUnidad) ? trasUnidad : trasUnidad.productos || []).find((item) => item.id === producto.id))

// 6) IMEI pendiente: se completa después en la línea.
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'serials', lineId: lineaAdicional.id, serials: [imeiB] }, 409)
const imeiC = '490154203237534'
const completada = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'serials', lineId: lineaAdicional.id, serials: imeiC }, 200)
const lineaCompletada = completada.lines.find((linea) => linea.id === lineaAdicional.id)
assert.equal(lineaCompletada.serials.length, 1)
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'serials', lineId: lineaAdicional.id, serials: [imeiC] }, 400, admin)

// 7) Validaciones de la compra.
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', lines: [] }, 400)
await req('/api/supply/purchases', 'POST', { lines: [{ productId: producto.id, quantity: 1 }] }, 400)
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', lines: [{ productId: producto.id, quantity: 0 }] }, 400)
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', currency: 'USD', originalCost: 10, lines: [{ productId: producto.id, quantity: 1 }] }, 400)
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', lines: [{ productId: producto.id, quantity: 1, serials: ['a', 'b'] }] }, 400)
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', lines: [{ productId: 'no-existe', quantity: 1 }] }, 404)
// Necesidad ya cubierta: no se puede volver a comprar.
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', lines: [{ needId: necesidad.id, productId: producto.id, quantity: 1 }] }, 409, admin)

// 8) Permisos.
await req('/api/supply/purchases', 'GET', undefined, 401, 'token-invalido')
if (vendedor) await req('/api/supply/purchases', 'GET', undefined, 403, vendedor)

// 9) Cancelar la compra devuelve la necesidad al panel y no toca stock.
const cancelada = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'cancel', reason: 'El proveedor no tenía stock' })
assert.equal(cancelada.status, 'CANCELADA')
const panel = await req('/api/supply/needs')
assert.ok(panel.grupos.some((grupo) => grupo.necesidades.includes(necesidad.id)), 'la necesidad vuelve a «Por comprar»')
const stockFinal = await req(`/api/stock?branchId=${rama}`)
const filaFinal = (Array.isArray(stockFinal) ? stockFinal : stockFinal.productos || []).find((item) => item.id === producto.id)
assert.equal(Number(filaFinal?.stock ?? 0), stockReferencia, 'comprar y cancelar no mueven el stock (solo la recepción lo hará)')

console.log(`PASS: compra ${compra.code} (USD → Gs) con IMEI y compra adicional · necesidad cubierta y devuelta al cancelar · stock intacto · ${checks} chequeos`)