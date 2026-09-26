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

// 2-ter) FIN (#254): la compra al contado nace sin deuda (Finanzas muestra
// pendientes y tenencia; una cuenta saldada no engorda el «por pagar»).
assert.equal(compraPorLinea.paymentCondition, 'CONTADO', 'por defecto, contado')
const finContado = await req('/api/finance')
const cuentasContado = finContado.supplierPayables?.rows || []
assert.ok(!cuentasContado.some((fila) => fila.reference === compraPorLinea.code), 'el contado no engorda el «por pagar»')

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

// 7-bis) FIN (#254): compra a crédito con vencimiento → cuenta por pagar; el
// crédito sin vencimiento no se acepta y cancelar la compra limpia la cuenta.
const compraCredito = await req('/api/supply/purchases', 'POST', {
  supplierName: 'Proveedor Crédito',
  currency: 'PYG',
  originalCost: 4000000,
  paymentCondition: 'CREDITO',
  dueAt: '2026-10-20T00:00:00.000Z',
  lines: [{ productId: producto.id, quantity: 1 }],
}, 201)
assert.equal(compraCredito.paymentCondition, 'CREDITO')
const finCredito = await req('/api/finance')
const cuentaCredito = (finCredito.supplierPayables?.rows || []).find((fila) => fila.reference === compraCredito.code)
assert.ok(cuentaCredito, 'el crédito queda como cuenta por pagar')
assert.equal(cuentaCredito.condition, 'CREDITO')
assert.equal(Number(cuentaCredito.amountPyg), 4000000)
assert.equal(Number(cuentaCredito.paidPyg), 0)
assert.equal(cuentaCredito.supplyPurchaseId, compraCredito.id, 'la cuenta queda vinculada a la compra')
assert.equal(String(cuentaCredito.dueAt).slice(0, 10), '2026-10-20', 'el vencimiento viaja a Finanzas')
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor', currency: 'PYG', originalCost: 100000, paymentCondition: 'CREDITO', lines: [{ productId: producto.id, quantity: 1 }] }, 400, admin)
const cancelable = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Crédito', currency: 'PYG', originalCost: 1000000, paymentCondition: 'CREDITO', dueAt: '2026-11-01T00:00:00.000Z', lines: [{ productId: producto.id, quantity: 1 }] }, 201)
await req('/api/supply/purchases', 'PATCH', { id: cancelable.id, action: 'cancel', reason: 'Prueba de cancelación de la cuenta' })
const finCancelada = await req('/api/finance')
assert.ok(!(finCancelada.supplierPayables?.rows || []).some((fila) => fila.reference === cancelable.code), 'la cuenta de la compra cancelada no queda colgada')

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

// 10) Compra parcial (#250 F2): comprar menos que la necesidad deja el resto
// en «Por comprar» y se puede completar con otra compra; el excedente es libre.
const productoParcial = await req('/api/products', 'POST', { name: `Parcial ${sufijo}`, sku: `PAR-${sufijo}`, pricePyg: 1500000, costPyg: 1000000, stock: 0, branchId: rama }, 201)
const necesaria = await req('/api/supply/needs', 'POST', { productId: productoParcial.id, quantity: 5, branchId: rama, notes: 'Compra parcial' }, 201)
const parcial = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Parcial', currency: 'PYG', originalCost: 2000000, reference: `FAC-PAR-${sufijo}`, lines: [{ needId: necesaria.id, productId: productoParcial.id, quantity: 2 }] }, 201)
assert.equal(parcial.lines[0].coveredQuantity, 2, 'la línea guarda cuánto de la necesidad cubre')
let parcialPanel = (await req(`/api/supply/needs?productId=${productoParcial.id}`)).grupos.find((grupo) => grupo.productoId === productoParcial.id)
assert.ok(parcialPanel && parcialPanel.cantidad === 3, 'lo que falta sigue en «Por comprar» (5 - 2)')
const parcialDetalle = await req(`/api/supply/needs?status=ABIERTA&productId=${productoParcial.id}`)
assert.ok(parcialDetalle.grupos.some((grupo) => grupo.necesidades.includes(necesaria.id)), 'la necesidad parcial sigue abierta')

// Se completa con una segunda compra por el resto.
const segunda = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Parcial', currency: 'PYG', originalCost: 3000000, lines: [{ needId: necesaria.id, productId: productoParcial.id, quantity: 3 }] }, 201)
assert.equal(segunda.lines[0].coveredQuantity, 3)
const cubiertaTotal = await req(`/api/supply/needs?status=COMPRADA&productId=${productoParcial.id}`)
assert.ok(cubiertaTotal.grupos.some((grupo) => grupo.necesidades.includes(necesaria.id)), 'con el resto comprado la necesidad queda COMPRADA')
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Parcial', currency: 'PYG', originalCost: 100000, lines: [{ needId: necesaria.id, productId: productoParcial.id, quantity: 1 }] }, 409)

// Excedente: comprar de más cubre la necesidad y el resto es reposición libre.
const necesaria2 = await req('/api/supply/needs', 'POST', { productId: productoParcial.id, quantity: 5, branchId: rama, notes: 'Excedente' }, 201)
const conExtra = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Parcial', currency: 'PYG', originalCost: 4000000, lines: [{ needId: necesaria2.id, productId: productoParcial.id, quantity: 8 }] }, 201)
assert.equal(conExtra.lines[0].coveredQuantity, 5, 'la cobertura se acota a la necesidad')
assert.equal(conExtra.lines[0].quantity, 8, 'la compra conserva las 8 unidades compradas')

// Duplicar la necesidad en dos líneas de la misma compra se rechaza.
const necesaria3 = await req('/api/supply/needs', 'POST', { productId: productoParcial.id, quantity: 2, branchId: rama, notes: 'Duplicada' }, 201)
await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Parcial', currency: 'PYG', originalCost: 200000, lines: [{ needId: necesaria3.id, productId: productoParcial.id, quantity: 1 }, { needId: necesaria3.id, productId: productoParcial.id, quantity: 1 }] }, 400)

// Cancelar una compra parcial devuelve exactamente lo que cubría.
const aCancelar = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Parcial', currency: 'PYG', originalCost: 2000000, lines: [{ needId: necesaria3.id, productId: productoParcial.id, quantity: 2 }] }, 201)
await req('/api/supply/purchases', 'PATCH', { id: aCancelar.id, action: 'cancel', reason: 'Prueba parcial' })
const restaurada = (await req(`/api/supply/needs?productId=${productoParcial.id}`)).grupos.flatMap((grupo) => grupo.necesidades)
assert.ok(restaurada.includes(necesaria3.id), 'la necesidad parcial vuelve al panel al cancelar')
const detalleRestaurado = await req('/api/supply/purchases')
const lineasRestauradas = detalleRestaurado.compras.find((fila) => fila.id === aCancelar.id)?.lines || []
assert.equal(lineasRestauradas[0]?.coveredQuantity, 2, 'la línea conserva la cobertura para la trazabilidad')

// 11) «+ Agregar compra adicional»: líneas nuevas en una compra activa, con
// reposición libre y cobertura de una necesidad pendiente.
const productoLibre = await req('/api/products', 'POST', { name: `Libre ${sufijo}`, sku: `LIB-${sufijo}`, pricePyg: 900000, costPyg: 600000, stock: 0, branchId: rama }, 201)
const necesariaLibre = await req('/api/supply/needs', 'POST', { productId: productoLibre.id, quantity: 2, branchId: rama, notes: 'Para la compra adicional' }, 201)
const compraAbierta = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor Libre', currency: 'PYG', reference: `FAC-LIB-${sufijo}`, lines: [{ productId: productoLibre.id, quantity: 1 }] }, 201)
assert.equal(compraAbierta.costPyg, null, 'la compra puede nacer sin costo (factura pendiente)')
assert.equal(compraAbierta.lines[0].libreQuantity, 1, 'una línea sin necesidad es reposición libre')
const conAdicionales = await req('/api/supply/purchases', 'PATCH', { id: compraAbierta.id, action: 'addLines', lines: [{ productId: productoLibre.id, quantity: 3 }, { needId: necesariaLibre.id, productId: productoLibre.id, quantity: 2 }] }, 200)
assert.equal(conAdicionales.lines.length, 3, 'la compra suma las líneas adicionales')
assert.equal(conAdicionales.lines.filter((linea) => !linea.needId).reduce((suma, linea) => suma + linea.quantity, 0), 4, 'la reposición libre suma 4')
assert.equal(conAdicionales.lines.find((linea) => linea.needId === necesariaLibre.id).coveredQuantity, 2, 'la necesidad pendiente queda cubierta')
const cubiertaLibre = await req(`/api/supply/needs?status=COMPRADA&productId=${productoLibre.id}`)
assert.ok(cubiertaLibre.grupos.some((grupo) => grupo.necesidades.includes(necesariaLibre.id)), 'la necesidad pasa a COMPRADA')
const stockLibre = await req(`/api/stock?branchId=${rama}`)
const filaLibre = (Array.isArray(stockLibre) ? stockLibre : stockLibre.productos || []).find((item) => item.id === productoLibre.id)
assert.equal(Number(filaLibre?.stock ?? 0), 0, 'agregar líneas tampoco mueve stock')

// Una necesidad no se repite en la misma compra (ni contra las líneas ya cargadas).
await req('/api/supply/purchases', 'PATCH', { id: compraAbierta.id, action: 'addLines', lines: [{ needId: necesariaLibre.id, productId: productoLibre.id, quantity: 1 }] }, 409)
// Con cuenta a pagar o cancelada no se agregan líneas.
await req('/api/supply/purchases', 'PATCH', { id: parcial.id, action: 'addLines', lines: [{ productId: productoLibre.id, quantity: 1 }] }, 409)
await req('/api/supply/purchases', 'PATCH', { id: cancelada.id, action: 'addLines', lines: [{ productId: productoLibre.id, quantity: 1 }] }, 409)
// El excedente de una línea que compró de más también queda como libre.
assert.equal(conExtra.lines[0].libreQuantity, 3, 'comprar 8 para una necesidad de 5 deja 3 libres')

console.log(`PASS: compra ${compra.code} (USD → Gs) con IMEI, parcial y adicional · cobertura/validaciones · reposición libre · stock intacto · ${checks} chequeos`)