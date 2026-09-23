import assert from 'node:assert/strict'

// #148 §19 — Reportes con costo real por unidad y comisiones al día:
// 1) el valor del stock usa el costo de cada unidad (con reparaciones y
//    repuestos de la inspección PhoneCheck), no el costo viejo del producto;
// 2) la comisión del período se calcula sobre el margen real (con costos
//    congelados, consignación, repuestos y seguro) y la liquidación coincide.
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
const adminId = 'user-admin-it'
const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
const sufijo = Date.now().toString(36).toUpperCase()

// ── 1) El valor del stock usa el costo real de la unidad ────────────────────
const antes = await req(`/api/reports?from=${hoy}&to=${hoy}`)
const stockAntes = Number(antes.inventory?.stockValuePyg ?? 0)
const costoBase = 800000
const repuestos = 120000
const precio = 2200000
const serial = `994${Date.now().toString().slice(-12)}`
const producto = await req('/api/products', 'POST', { name: `Equipo reparado ${sufijo}`, sku: `REP-${sufijo}`, pricePyg: precio, costPyg: costoBase, stock: 1, imei: serial, branchId: rama, condition: 'USED' }, 201)
const unidades = await req(`/api/inventory-units?q=${serial}&branchId=${rama}`)
const lista = Array.isArray(unidades) ? unidades : unidades.units || []
const unidad = lista.find((fila) => fila.serial === serial)
assert.ok(unidad, 'la unidad aparece en Inventario')
await req('/api/inventory-units', 'PATCH', { id: unidad.id, action: 'inspection', inspection: { items: [{ clave: 'pantalla', estado: 'falla', nota: 'No OEM' }], repuestosNoOem: 'Pantalla no original', costoRepuestosPyg: repuestos } })
const despues = await req(`/api/reports?from=${hoy}&to=${hoy}`)
const stockDespues = Number(despues.inventory?.stockValuePyg ?? 0)
assert.equal(stockDespues - stockAntes, costoBase + repuestos, 'el valor del stock tiene que incluir el costo de la unidad y sus repuestos')

// ── 2) Comisiones sobre el margen real ──────────────────────────────────────
const reglas = await req('/api/commission-rules')
const listaReglas = Array.isArray(reglas) ? reglas : reglas.rules || []
const regla = listaReglas.find((fila) => (fila.userId ?? fila.user?.id) === adminId)
if (regla) await req('/api/commission-rules', 'PATCH', { id: regla.id, percentPyg: 10 })
else await req('/api/commission-rules', 'POST', { userId: adminId, percentPyg: 10 }, 201)

const filaComision = async () => {
  const reporte = await req(`/api/reports?type=commissions&from=${hoy}&to=${hoy}`)
  return (reporte.sellers || []).find((row) => row.sellerId === adminId) || {}
}
const comisionDe = async () => Number((await filaComision()).commissionPyg ?? 0)
const comisionAntes = await comisionDe()

// El equipo queda en consignación y se vende a un cliente con seguro 10%: el
// margen real es precio − (consignación + repuestos + seguro).
const consignorPyg = 1500000
await req('/api/inventory-units', 'PATCH', { id: unidad.id, action: 'details', consignorName: 'Tercero demo', consignorPyg })
const cliente = await req('/api/customers', 'POST', { name: `Cliente reportes ${sufijo}`, firstName: 'Cliente', insuranceEnabled: true, insuranceRatePct: 10 }, 201)
const venta = await req('/api/orders', 'POST', {
  customerId: cliente.id,
  branchId: rama,
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: precio, inventoryUnitSerials: [serial] }],
  payments: [{ method: 'TRANSFER', amountPyg: precio, status: 'CONFIRMED' }],
}, 201)
const linea = venta.items?.[0]
const costoReal = consignorPyg + repuestos
const seguro = Math.round((costoReal * 10) / 100)
assert.equal(Number(linea.baseUnitCostPyg), costoReal, 'la base del costo es la consignación más los repuestos')
assert.equal(Number(linea.insurancePyg), seguro, 'el seguro va sobre esa base')
const margenReal = precio - (costoReal + seguro)
const comisionEsperada = Math.round((margenReal * 10) / 100)
const comisionDespues = await comisionDe()
assert.equal(comisionDespues - comisionAntes, comisionEsperada, 'la comisión del día usa el margen real')

// ── 2b) El descuento del carrito baja la ganancia y la comisión ─────────────
// Venta de 1.000.000 con 100.000 de descuento a nivel orden y costo 600.000:
// la ganancia del reporte tiene que ser 300.000 (Total − Costo), no 400.000, y
// la comisión 10% se liquida sobre ese margen neto.
const gananciaDelVendedor = async () => {
  const reporte = await req(`/api/reports?from=${hoy}&to=${hoy}&groupBy=seller`)
  const fila = (reporte.groups || []).find((row) => row.key === adminId)
  return Number(fila?.profitPyg ?? 0)
}
const gananciaAntes = await gananciaDelVendedor()
const comisionAntesDescuento = await comisionDe()
const precioDescuento = 1000000
const costoDescuento = 600000
const descuentoCarrito = 100000
const productoDescuento = await req('/api/products', 'POST', { name: `Producto descuento ${sufijo}`, sku: `DSC-${sufijo}`, pricePyg: precioDescuento, costPyg: costoDescuento, stock: 2, branchId: rama }, 201)
const ventaDescuento = await req('/api/orders', 'POST', {
  branchId: rama,
  items: [{ productId: productoDescuento.id, description: productoDescuento.name, quantity: 1, unitPricePyg: precioDescuento }],
  discountPyg: descuentoCarrito,
  payments: [{ method: 'TRANSFER', amountPyg: precioDescuento - descuentoCarrito, status: 'CONFIRMED' }],
}, 201)
assert.equal(Number(ventaDescuento.discountPyg), descuentoCarrito, 'el descuento del carrito queda en la orden')
assert.equal(Number(ventaDescuento.totalPyg), precioDescuento - descuentoCarrito, 'el total ya viene neto del descuento')
const margenDescuento = (precioDescuento - descuentoCarrito) - costoDescuento
assert.equal((await gananciaDelVendedor()) - gananciaAntes, margenDescuento, 'la ganancia del reporte es Total − Costo, con el descuento del carrito')
let comisionVigente = await comisionDe()
assert.equal(comisionVigente - comisionAntesDescuento, Math.round((margenDescuento * 10) / 100), 'la comisión usa el margen neto del descuento')

// ── 2c) Una línea bajo costo no infla la comisión ──────────────────────────
// Venta mixta: línea A con costo 200.000 y 100.000 de descuento (queda en
// 100.000, pierde 100.000) + línea B con costo 100.000 vendida a 500.000. El
// margen de la venta es 600.000 − 300.000 = 300.000: el reporte y la comisión
// 10% (30.000) tienen que usar esa cuenta. Antes la comisión pisaba línea por
// línea y pagaba 40.000 porque la pérdida de A no descontaba.
const filaComisionAntes = await filaComision()
const gananciaAntesMixta = await gananciaDelVendedor()
const productoPerdida = await req('/api/products', 'POST', { name: `Liquidación ${sufijo}`, sku: `LIQ-${sufijo}`, pricePyg: 200000, costPyg: 200000, stock: 2, branchId: rama }, 201)
const productoRentable = await req('/api/products', 'POST', { name: `Rentable ${sufijo}`, sku: `REN-${sufijo}`, pricePyg: 500000, costPyg: 100000, stock: 2, branchId: rama }, 201)
const ventaMixta = await req('/api/orders', 'POST', {
  branchId: rama,
  items: [
    { productId: productoPerdida.id, description: productoPerdida.name, quantity: 1, unitPricePyg: 200000, discountPyg: 100000 },
    { productId: productoRentable.id, description: productoRentable.name, quantity: 1, unitPricePyg: 500000 },
  ],
  payments: [{ method: 'TRANSFER', amountPyg: 600000, status: 'CONFIRMED' }],
}, 201)
assert.equal(Number(ventaMixta.totalPyg), 600000, 'la venta mixta queda en 600.000')
const margenMixto = 300000
assert.equal((await gananciaDelVendedor()) - gananciaAntesMixta, margenMixto, 'la ganancia se pisa una sola vez por venta')
const filaComisionDespues = await filaComision()
assert.equal(Number(filaComisionDespues.marginPyg ?? 0) - Number(filaComisionAntes.marginPyg ?? 0), margenMixto, 'la comisión usa el mismo margen por venta que el reporte')
assert.equal(Number(filaComisionDespues.commissionPyg ?? 0) - Number(filaComisionAntes.commissionPyg ?? 0), Math.round((margenMixto * 10) / 100), 'ni un peso más de comisión por la línea bajo costo')
comisionVigente = await comisionDe()

// ── 3) La liquidación coincide con el reporte (sin duplicar) ───────────────
const respuesta = await fetch(`${base}/api/commission-settlements`, { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerId: adminId, from: hoy, to: hoy }) })
const liquidacion = await respuesta.json()
if (respuesta.status === 201) {
  const total = Number(liquidacion.totalPyg ?? liquidacion.commissionPyg ?? 0)
  assert.equal(total, comisionVigente, 'la liquidación coincide con la comisión del reporte')
  checks++
} else {
  assert.equal(respuesta.status, 409, `liquidación inesperada: ${JSON.stringify(liquidacion)}`)
  console.log('NOTA: ya existía una liquidación del vendedor para hoy; no se duplicó.')
}

console.log(`PASS: stock con costo real (+${costoBase + repuestos}) · comisión ${comisionEsperada} sobre margen real ${margenReal} · descuento de carrito ${descuentoCarrito} → ganancia ${margenDescuento} y comisión ${Math.round((margenDescuento * 10) / 100)} · línea bajo costo → margen ${margenMixto} y comisión ${Math.round((margenMixto * 10) / 100)} · ${checks} chequeos`)
