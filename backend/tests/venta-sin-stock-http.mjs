import assert from 'node:assert/strict'
import pg from 'pg'

// Venta sin stock · compra, pago y costo (HTTP + Postgres real).
// Una venta sin stock → comprar sin costo → costo después (llega a la venta original, margen
// en la fecha de la venta) → marcar pagado (salida de caja una sola vez) → recibido rápido
// (stockPending baja, kardex neto 0) → pedido público con el estado. Permisos por rol y
// el caso «sin Finanzas»: queda ya pagado sin cuenta y Finanzas la asigna sin doble salida.
const [base, admin, vendedor, gerente, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !vendedor || !gerente || !databaseUrl) throw new Error('Uso: venta-sin-stock-http.mjs <base> <admin> <vendedor> <gerente> <databaseUrl>')
let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.77' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.ok(Array.isArray(expected) ? expected.includes(response.status) : response.status === expected, `${method} ${path}: esperado ${expected}, llegó ${response.status} ${JSON.stringify(data)}`)
  checks++
  return data
}
const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()
const uno = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const sufijo = Date.now().toString(36).toUpperCase()
const rama = 'branch-a-it'
const PRECIO = 1000000
const COSTO = 640000

try {
  const cuenta = await req('/api/payment-accounts', 'POST', { name: `Caja proveedores ${sufijo}`, kind: 'CASH', currency: 'PYG' }, 201)
  const cliente = await req('/api/customers', 'POST', { name: `Cliente sin stock ${sufijo}` }, 201)
  // Sin costo en el producto: la línea nace con el costo pendiente.
  const producto = await req('/api/products', 'POST', { name: `Cable sin stock ${sufijo}`, sku: `VSS-${sufijo}`, pricePyg: PRECIO, stock: 0, branchId: rama }, 201)
  const margenAntes = (await req('/api/finance')).margin
  const prometida = new Date(Date.now() + 5 * 86400000).toISOString()
  const pedido = await req('/api/orders', 'POST', {
    orderNumber: `VSS-${sufijo}`, customerId: cliente.id, promisedAt: prometida,
    items: [{ productId: producto.id, description: producto.name, quantity: 2, unitPricePyg: PRECIO, backorder: true }],
    payment: { method: 'CASH', amountPyg: PRECIO },
  }, 201)
  const lineaVenta = () => uno('SELECT "stockPending", "costPending", "costSource", "unitCostPyg", "backorderArrivedAt" FROM "OrderItem" WHERE "orderId" = $1', [pedido.id])
  let linea = await lineaVenta()
  assert.equal(linea.stockPending, 2)
  assert.equal(linea.costPending, true, 'la línea se vendió sin saber el costo')
  const margenVenta = (await req('/api/finance')).margin
  assert.ok(Number(margenVenta.unknownCostLines) > Number(margenAntes.unknownCostLines), 'la venta sin costo figura como «costo desconocido» en el margen')

  // 1) Por comprar con estado, cliente, fecha prometida y «falta costo».
  const panel = await req(`/api/supply/needs?detalle=1&estados=ABIERTA,ASIGNADA,COMPRADA,RECIBIDA&productId=${producto.id}`)
  const fila = panel.lineas.find((item) => item.pedidoId === pedido.id)
  assert.ok(fila, 'la necesidad está en el detalle')
  assert.equal(fila.estado, 'PENDIENTE_COMPRA')
  assert.equal(fila.siguientePaso, 'COMPRAR')
  assert.equal(fila.cliente, `Cliente sin stock ${sufijo}`)
  assert.ok(fila.prometidaEl, 'trae la fecha prometida')
  assert.equal(fila.porComprar, 2)
  const necesidadId = fila.id

  // 2) Comprar SIN costo: estado «Comprado», «Falta costo» y próxima acción «Cargar costo».
  const compra = await req('/api/supply/purchases', 'POST', {
    supplierName: `Proveedor ${sufijo}`, currency: 'PYG', paymentCondition: 'CONTADO',
    lines: [{ needId: necesidadId, productId: producto.id, quantity: 2 }],
  }, 201)
  assert.equal(compra.paidAt, null, 'la compra al contado ya no nace pagada sin salida de caja')
  let detalle = (await req(`/api/supply/needs?detalle=1&estados=COMPRADA&productId=${producto.id}`)).lineas.find((item) => item.id === necesidadId)
  assert.equal(detalle.estado, 'COMPRADO')
  assert.equal(detalle.faltaCosto, true)
  assert.equal(detalle.siguientePaso, 'CARGAR_COSTO')
  // Sin costo no hay monto: marcar pagado se rechaza.
  await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'markPaid', accountId: cuenta.id }, 409)

  // 3) Costo después → llega a la venta original una sola vez; el margen queda en la fecha de la venta.
  const conCosto = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'setCost', unitCostPyg: COSTO }, 200)
  assert.equal(Number(conCosto.costPyg), COSTO * 2)
  assert.equal(conCosto.ventasConCosto, 1)
  linea = await lineaVenta()
  assert.equal(Number(linea.unitCostPyg), COSTO)
  assert.equal(linea.costSource, 'PURCHASE')
  assert.equal(linea.costPending, false)
  const margenDespues = (await req('/api/finance')).margin
  assert.equal(Number(margenDespues.costPyg) - Number(margenVenta.costPyg), COSTO * 2, 'el costo entra al margen de la venta original')
  assert.equal(Number(margenDespues.unknownCostLines), Number(margenVenta.unknownCostLines) - 1)
  const repetido = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'setCost', unitCostPyg: COSTO }, 200)
  assert.equal(repetido.ventasConCosto, 0, 'repetir el costo es idempotente')
  assert.equal(Number((await lineaVenta()).unitCostPyg), COSTO)
  detalle = (await req(`/api/supply/needs?detalle=1&estados=COMPRADA&productId=${producto.id}`)).lineas.find((item) => item.id === necesidadId)
  assert.equal(detalle.faltaCosto, false)
  assert.equal(detalle.siguientePaso, 'MARCAR_PAGADO')
  assert.equal(detalle.costoUnitarioPyg, COSTO, 'quien ve costos los ve')

  // 4) Permisos por rol.
  await req('/api/supply/needs?detalle=1', 'GET', null, 403, vendedor)
  await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'markPaid', accountId: cuenta.id }, 403, vendedor)
  await req('/api/supply/receptions', 'POST', { action: 'receiveQuick', needId: necesidadId, quantity: 1 }, 403, vendedor)
  await req('/api/finance', 'POST', { action: 'supplyPaymentAccount', purchaseId: compra.id, accountId: cuenta.id }, 403, vendedor)

  // 5) Marcar pagado con cuenta: una sola salida de caja por el monto completo.
  await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'markPaid' }, 400)
  const pagada = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'markPaid', accountId: cuenta.id }, 200)
  assert.ok(pagada.paidAt)
  assert.equal(pagada.pago.pagadoPyg, COSTO * 2)
  assert.equal(pagada.pago.conCuenta, true)
  await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'markPaid', accountId: cuenta.id }, 409)
  const salidas = (await db.query(`SELECT "amountPyg", "direction", "accountId" FROM "CashMovement" WHERE "tenantId" = 'tenant-a-it' AND "idempotencyKey" = $1`, [`supply-purchase-paid:${compra.id}`])).rows
  assert.equal(salidas.length, 1, 'la salida de caja se creó una sola vez')
  assert.equal(Number(salidas[0].amountPyg), COSTO * 2)
  assert.equal(salidas[0].direction, 'OUT')
  assert.equal(salidas[0].accountId, cuenta.id)
  const cuentaPagar = await uno(`SELECT "paidPyg", "amountPyg" FROM "SupplierPayable" WHERE "supplyPurchaseId" = $1`, [compra.id])
  assert.equal(Number(cuentaPagar.paidPyg), COSTO * 2)
  await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'cancel', reason: 'no debería poder' }, 409)

  // 6) Recibido rápido: baja stockPending con tope 0 y el kardex queda en neto cero.
  const stockAntes = Number((await req(`/api/products?q=${producto.sku}`)).find((item) => item.id === producto.id).stock)
  await req('/api/supply/receptions', 'POST', { action: 'receiveQuick', needId: necesidadId, quantity: 0 }, 400)
  const parcial = await req('/api/supply/receptions', 'POST', { action: 'receiveQuick', needId: necesidadId, quantity: 1 }, 200)
  assert.deepEqual([parcial.aplicadas, parcial.restantes, parcial.llegoTodo], [1, 1, false])
  assert.equal((await lineaVenta()).stockPending, 1)
  const resto = await req('/api/supply/receptions', 'POST', { action: 'receiveQuick', needId: necesidadId, quantity: 9 }, 200)
  assert.deepEqual([resto.aplicadas, resto.restantes, resto.llegoTodo], [1, 0, true], 'el tope es lo que faltaba')
  await req('/api/supply/receptions', 'POST', { action: 'receiveQuick', needId: necesidadId, quantity: 1 }, 409)
  linea = await lineaVenta()
  assert.equal(linea.stockPending, 0)
  assert.ok(linea.backorderArrivedAt)
  const stockDespues = Number((await req(`/api/products?q=${producto.sku}`)).find((item) => item.id === producto.id).stock)
  assert.equal(stockDespues, stockAntes, 'la unidad llega y sale al cliente: el stock no cambia')
  const kardex = await req(`/api/products/${producto.id}/kardex`)
  const movimientos = kardex.movimientos.filter((item) => String(item.label).includes('VSS') || String(item.label).includes('Recepción rápida') || String(item.label).includes('Venta'))
  const neto = movimientos.reduce((suma, item) => suma + Number(item.delta), 0)
  assert.equal(neto, 0, `entradas y salidas del producto suman cero: ${JSON.stringify(movimientos.map((item) => [item.label, item.delta]))}`)
  assert.ok(movimientos.some((item) => item.delta > 0), 'hay una entrada de la recepción rápida')
  const necesidad = await uno('SELECT "status", "arrivedAt", "receivedQty" FROM "SupplyNeed" WHERE "id" = $1', [necesidadId])
  assert.equal(necesidad.status, 'RECIBIDA')
  assert.equal(necesidad.receivedQty, 2)
  assert.ok(necesidad.arrivedAt)

  // 7) Estado en el pedido interno y en el público (franja fuera del snapshot).
  const interno = await req(`/api/orders/${pedido.id}`)
  assert.equal(interno.sobrePedido.estado, 'LLEGO')
  assert.ok(!JSON.stringify(interno.sobrePedido).match(/cost|costo/i), 'el estado no lleva costos')
  const vistaVendedor = await req(`/api/orders/${pedido.id}`, 'GET', null, 200, vendedor).catch(() => null)
  if (vistaVendedor) assert.ok(!JSON.stringify(vistaVendedor.sobrePedido ?? {}).match(/costPyg|unitCost/i))
  const acceso = await req(`/api/orders/${pedido.id}/access-tokens`, 'POST', { level: 'rapido' }, [200, 201])
  const publico = await req(`/api/orders/public/${acceso.token}`)
  assert.equal(publico.estadoPedido.estado, 'LLEGO')
  assert.equal(publico.estadoPedido.titulo, 'Listo para retirar')
  assert.ok(!JSON.stringify(publico.estadoPedido).match(/cost|proveedor|supplier/i), 'el cliente no ve costos ni proveedores')

  // 8) Avisar al cliente: lo manda la persona y queda registrado.
  const avisado = await req('/api/supply/needs', 'PATCH', { id: necesidadId, action: 'notified' }, 200)
  assert.equal(avisado.avisadas, 1)
  assert.ok((await uno('SELECT "customerNotifiedAt" FROM "SupplyNeed" WHERE "id" = $1', [necesidadId])).customerNotifiedAt)

  // 9) Sin permiso de Finanzas: queda «ya pagado» sin cuenta y Finanzas la asigna sin doble salida.
  const productoB = await req('/api/products', 'POST', { name: `Funda sin stock ${sufijo}`, sku: `VSB-${sufijo}`, pricePyg: PRECIO, stock: 0, branchId: rama }, 201)
  const pedidoB = await req('/api/orders', 'POST', {
    orderNumber: `VSB-${sufijo}`, items: [{ productId: productoB.id, description: productoB.name, quantity: 1, unitPricePyg: PRECIO, backorder: true }], payment: { method: 'CASH', amountPyg: PRECIO },
  }, 201)
  const filaB = (await req(`/api/supply/needs?detalle=1&productId=${productoB.id}`)).lineas.find((item) => item.pedidoId === pedidoB.id)
  // Compra a crédito: no nace pagada; contado con «ya pagó» sin cuenta lo prueba el flujo de markPaid.
  const compraB = await req('/api/supply/purchases', 'POST', {
    supplierName: `Proveedor B ${sufijo}`, currency: 'PYG', paymentCondition: 'CONTADO', originalCost: 300000,
    lines: [{ needId: filaB.id, productId: productoB.id, quantity: 1, unitCostPyg: 300000 }],
  }, 201)
  // Contado que pide la cuenta: quien tiene Finanzas y dice «ya pagado» sin cuenta recibe 400.
  await req('/api/supply/purchases', 'POST', { supplierName: `Proveedor C ${sufijo}`, currency: 'PYG', paymentCondition: 'CONTADO', originalCost: 100000, yaPagado: true, lines: [{ productId: productoB.id, quantity: 1 }] }, 400)
  // Con cuenta pero a crédito: no corresponde pagarla al registrar.
  await req('/api/supply/purchases', 'POST', { supplierName: `Proveedor C ${sufijo}`, currency: 'PYG', paymentCondition: 'CREDITO', dueAt: '2027-01-10T00:00:00.000Z', originalCost: 100000, yaPagado: true, accountId: cuenta.id, lines: [{ productId: productoB.id, quantity: 1 }] }, 400)
  // El encargado de stock sin Finanzas: se le quita `cash:manage` al gerente de prueba y se restaura al terminar.
  const original = await uno(`SELECT "permissions" FROM "User" WHERE "id" = 'user-gerente-it'`)
  await db.query(`UPDATE "User" SET "permissions" = '["stock:manage","orders:manage","products:manage"]'::jsonb WHERE "id" = 'user-gerente-it'`)
  try {
    await req('/api/supply/purchases', 'PATCH', { id: compraB.id, action: 'markPaid', accountId: cuenta.id }, 403, gerente)
    const sinCuenta = await req('/api/supply/purchases', 'PATCH', { id: compraB.id, action: 'markPaid' }, 200, gerente)
    assert.equal(sinCuenta.pago.conCuenta, false)
    assert.equal(sinCuenta.pago.pendienteDeCuenta, true)
    assert.ok(sinCuenta.paidAt)
    assert.equal(sinCuenta.paymentPendingAccount, true)
    await req('/api/supply/purchases', 'PATCH', { id: compraB.id, action: 'markPaid' }, 409, gerente)
  } finally {
    await db.query(`UPDATE "User" SET "permissions" = $1::jsonb WHERE "id" = 'user-gerente-it'`, [original?.permissions === null || original?.permissions === undefined ? null : JSON.stringify(original.permissions)])
  }
  assert.equal((await db.query(`SELECT 1 FROM "CashMovement" WHERE "idempotencyKey" = $1`, [`supply-purchase-paid:${compraB.id}`])).rowCount, 0, 'todavía no hay salida de caja')
  const finanzas = await req('/api/finance')
  const sinCuentaFila = finanzas.supplyPaymentsNoAccount.rows.find((item) => item.id === compraB.id)
  assert.ok(sinCuentaFila, 'Finanzas lista «Pagos a proveedor sin cuenta»')
  assert.equal(sinCuentaFila.amountPyg, 300000)
  await req('/api/finance', 'POST', { action: 'supplyPaymentAccount', purchaseId: compraB.id, accountId: 'no-existe' }, 400)
  await req('/api/finance', 'POST', { action: 'supplyPaymentAccount', purchaseId: compraB.id, accountId: cuenta.id }, 200)
  await req('/api/finance', 'POST', { action: 'supplyPaymentAccount', purchaseId: compraB.id, accountId: cuenta.id }, 409)
  const salidasB = (await db.query(`SELECT "amountPyg" FROM "CashMovement" WHERE "idempotencyKey" = $1`, [`supply-purchase-paid:${compraB.id}`])).rows
  assert.equal(salidasB.length, 1, 'sin doble salida')
  assert.equal(Number(salidasB[0].amountPyg), 300000)
  assert.equal(Number((await uno(`SELECT "paidPyg" FROM "SupplierPayable" WHERE "supplyPurchaseId" = $1`, [compraB.id])).paidPyg), 300000, 'asignar la cuenta no vuelve a sumar al pagado')
  assert.ok(!(await req('/api/finance')).supplyPaymentsNoAccount.rows.some((item) => item.id === compraB.id), 'sale de la lista al asignarla')

  // 10) Cancelar una compra sin pagar devuelve el costo pendiente a la venta (solo si venía de la compra).
  const productoC = await req('/api/products', 'POST', { name: `Vidrio sin stock ${sufijo}`, sku: `VSC-${sufijo}`, pricePyg: PRECIO, stock: 0, branchId: rama }, 201)
  const pedidoC = await req('/api/orders', 'POST', { orderNumber: `VSC-${sufijo}`, items: [{ productId: productoC.id, description: productoC.name, quantity: 1, unitPricePyg: PRECIO, backorder: true }], payment: { method: 'CASH', amountPyg: PRECIO } }, 201)
  const filaC = (await req(`/api/supply/needs?detalle=1&productId=${productoC.id}`)).lineas.find((item) => item.pedidoId === pedidoC.id)
  const compraC = await req('/api/supply/purchases', 'POST', { supplierName: `Proveedor D ${sufijo}`, currency: 'PYG', paymentCondition: 'CONTADO', originalCost: 200000, lines: [{ needId: filaC.id, productId: productoC.id, quantity: 1, unitCostPyg: 200000 }] }, 201)
  assert.equal(Number((await uno('SELECT "unitCostPyg" FROM "OrderItem" WHERE "orderId" = $1', [pedidoC.id])).unitCostPyg), 200000, 'comprar con costo lo imputa al instante')
  await req('/api/supply/purchases', 'PATCH', { id: compraC.id, action: 'cancel', reason: 'se cayó el proveedor' }, 200)
  const lineaC = await uno('SELECT "costPending", "unitCostPyg", "costSource" FROM "OrderItem" WHERE "orderId" = $1', [pedidoC.id])
  assert.equal(lineaC.costPending, true)
  assert.equal(lineaC.unitCostPyg, null)
  assert.equal(lineaC.costSource, null)

  // 11) Cada paso quedó auditado.
  const acciones = (await db.query(`SELECT DISTINCT "action" FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND "action" LIKE ANY (ARRAY['SUPPLY_PURCHASE_PAID%', 'SUPPLY_QUICK_RECEIVED', 'ORDER_ITEM_COST_FROM_PURCHASE', 'ORDER_ITEM_COST_REVERTED', 'SUPPLY_CUSTOMER_NOTIFIED', 'SUPPLY_PURCHASE_ACCOUNT_ASSIGNED', 'SUPPLY_NEED_ARRIVED', 'SUPPLY_PURCHASE_COST_UPDATED'])`)).rows.map((fila) => fila.action)
  for (const accion of ['SUPPLY_PURCHASE_PAID', 'SUPPLY_PURCHASE_PAID_NO_ACCOUNT', 'SUPPLY_QUICK_RECEIVED', 'ORDER_ITEM_COST_FROM_PURCHASE', 'ORDER_ITEM_COST_REVERTED', 'SUPPLY_CUSTOMER_NOTIFIED', 'SUPPLY_PURCHASE_ACCOUNT_ASSIGNED', 'SUPPLY_PURCHASE_COST_UPDATED']) assert.ok(acciones.includes(accion), `auditoría ${accion}`)

  console.log(`venta-sin-stock-http: ${checks} verificaciones OK`)
} finally {
  await db.end()
}
