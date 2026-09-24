import assert from 'node:assert/strict'

// #250 Fase 4 — Lotes y tránsito: una compra dividida en varios envíos con
// método (bus/transportadora/AEX/importación), manifiesto con QR público,
// estados BORRADOR → EN_TRANSITO (+ incidencia/cancelado), historial por unidad
// y compras externas como **envío entrante** (nunca traslado interno). La
// recepción (RECIBIDO) es de la Fase 5 y el stock no se mueve acá.
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
const imeiA = '490154203237658'

// 1) Producto sin stock, necesidad y compra con dos líneas (2 + 1 unidades).
const producto = await req('/api/products', 'POST', { name: `Lote A ${sufijo}`, sku: `LOT-A-${sufijo}`, pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: rama }, 201)
const productoB = await req('/api/products', 'POST', { name: `Lote B ${sufijo}`, sku: `LOT-B-${sufijo}`, pricePyg: 1000000, costPyg: 700000, stock: 0, branchId: rama }, 201)
const compra = await req('/api/supply/purchases', 'POST', {
  supplierName: `Proveedor Lote ${sufijo}`,
  currency: 'PYG',
  originalCost: 3700000,
  lines: [
    { productId: producto.id, quantity: 2, serials: [imeiA] },
    { productId: productoB.id, quantity: 1 },
  ],
}, 201)

// 2) Compras externas = envío entrante: el traslado interno no se toca.
const transferenciasAntes = await req('/api/transfers')
const envioUno = await req('/api/supply/shipments', 'POST', {
  purchaseId: compra.id,
  origin: 'CDE',
  destinationBranchId: rama,
  method: 'BUS',
  company: 'Bus del Este',
  etaAt: '2026-09-30T18:00:00.000Z',
  lines: [{ lineId: compra.lines[0].id }],
}, 201)
assert.equal(envioUno.status, 'BORRADOR')
assert.ok(/^ENV-CDE-/.test(envioUno.code), `código inesperado: ${envioUno.code}`)
assert.equal(envioUno.items.length, 2, 'el lote lleva las dos unidades de la línea')
assert.equal(envioUno.items.filter((item) => item.serial).length, 1, 'un IMEI conocido')
assert.equal(envioUno.items.filter((item) => !item.serial).length, 1, 'una unidad con IMEI pendiente')
const transferenciasDespues = await req('/api/transfers')
assert.equal((transferenciasDespues.length ?? transferenciasDespues.pedidos?.length ?? 0), (transferenciasAntes.length ?? transferenciasAntes.pedidos?.length ?? 0), 'el envío entrante no crea traslados internos')

// La segunda línea viaja en otro lote (una compra → varios envíos).
const envioDos = await req('/api/supply/shipments', 'POST', { purchaseId: compra.id, origin: 'USA', method: 'IMPORTACION', lines: [{ lineId: compra.lines[1].id }] }, 201)
assert.equal(envioDos.items.length, 1)
// Y no quedan unidades libres para un tercer lote.
await req('/api/supply/shipments', 'POST', { purchaseId: compra.id, method: 'AEX', lines: [{ lineId: compra.lines[0].id }] }, 400)
await req('/api/supply/shipments', 'POST', { purchaseId: compra.id, method: 'BARCO' }, 400)
await req('/api/supply/shipments', 'POST', { purchaseId: 'no-existe', method: 'BUS' }, 404)

// 3) Estados: BORRADOR → PREPARANDO → DESPACHADO → EN_TRANSITO.
await req('/api/supply/shipments', 'PATCH', { id: envioDos.id, action: 'dispatch' }, 409, admin)
await req('/api/supply/shipments', 'PATCH', { id: envioUno.id, action: 'status', status: 'EN_TRANSITO' }, 409, admin)
const preparado = await req('/api/supply/shipments', 'PATCH', { id: envioUno.id, action: 'prepare' })
assert.equal(preparado.status, 'PREPARANDO')
// Sin empresa ni guía el despacho no se permite (el envío 2 no tiene empresa).
const preparadoDos = await req('/api/supply/shipments', 'PATCH', { id: envioDos.id, action: 'prepare' })
assert.equal(preparadoDos.status, 'PREPARANDO')
await req('/api/supply/shipments', 'PATCH', { id: envioDos.id, action: 'dispatch' }, 400, admin)
const despachadoDos = await req('/api/supply/shipments', 'PATCH', { id: envioDos.id, action: 'dispatch', guide: `IMP-${sufijo}` })
assert.equal(despachadoDos.status, 'DESPACHADO')
const despachado = await req('/api/supply/shipments', 'PATCH', { id: envioUno.id, action: 'dispatch', guide: `GUIA-${sufijo}` })
assert.equal(despachado.status, 'DESPACHADO')
assert.ok(despachado.sentAt, 'el despacho guarda la salida')
const enTransito = await req('/api/supply/shipments', 'PATCH', { id: envioUno.id, action: 'transit' })
assert.equal(enTransito.status, 'EN_TRANSITO')
// La recepción es de la Fase 5 y no se puede forzar desde acá.
await req('/api/supply/shipments', 'PATCH', { id: envioUno.id, action: 'status', status: 'RECIBIDO' }, 409, admin)

// 4) Manifiesto con QR: interno y público (sin costos ni proveedor).
const manifiesto = await req(`/api/supply/shipments/${envioUno.id}/manifest`)
assert.equal(manifiesto.code, envioUno.code)
assert.equal(manifiesto.metodoLabel, 'Bus')
assert.equal(manifiesto.unidades, 2)
assert.equal(manifiesto.conImei, 1)
assert.equal(manifiesto.pendientes, 1)
assert.ok(manifiesto.enlace && /\/envio\//.test(manifiesto.enlace), 'el manifiesto trae el enlace del QR')
const token = manifiesto.enlace.split('/envio/')[1]
const publico = await fetch(`${base}/api/public/supply/shipments/${token}`).then((respuesta) => respuesta.json())
checks++
assert.equal(publico.code, envioUno.code)
assert.equal(publico.proveedor, undefined, 'el manifiesto público no expone el proveedor')
assert.equal(publico.unidades, 2)
const publicoMalo = await fetch(`${base}/api/public/supply/shipments/token-inexistente`).then((respuesta) => respuesta.status)
checks++
assert.equal(publicoMalo, 404)

// 5) Historial por unidad: necesidad → compra → lote → estado.
const historial = await req(`/api/supply/serials/${imeiA}`)
assert.equal(historial.serial, imeiA)
assert.equal(historial.enStock, false, 'la unidad todavía no está en stock')
assert.equal(historial.compra.code, compra.code)
assert.equal(historial.lotes.length, 1)
assert.equal(historial.lotes[0].envio, envioUno.code)
assert.equal(historial.lotes[0].estado, 'EN_TRANSITO')
assert.equal(historial.producto.nombre, producto.name)

// 6) Incidencia y cancelación con motivo.
await req('/api/supply/shipments', 'PATCH', { id: envioUno.id, action: 'incidencia' }, 400, admin)
const conIncidencia = await req('/api/supply/shipments', 'PATCH', { id: envioUno.id, action: 'incidencia', reason: 'Llegó una caja dañada' })
assert.equal(conIncidencia.status, 'CON_INCIDENCIA')
await req('/api/supply/shipments', 'PATCH', { id: envioDos.id, action: 'cancel' }, 400, admin)
const cancelado = await req('/api/supply/shipments', 'PATCH', { id: envioDos.id, action: 'cancel', reason: 'El proveedor canceló el despacho' })
assert.equal(cancelado.status, 'CANCELADO')

// 7) Auditoría, permisos y stock intacto.
const auditoria = await req('/api/audit?action=SUPPLY_SHIPMENT_DISPATCHED&limit=20')
const entradas = Array.isArray(auditoria) ? auditoria : auditoria?.entradas || auditoria?.rows || []
assert.ok(entradas.length > 0, 'el despacho del lote queda auditado')
await req(`/api/supply/shipments/${envioUno.id}/manifest`, 'GET', undefined, 401, 'token-invalido')
if (vendedor) await req('/api/supply/shipments', 'GET', undefined, 403, vendedor)
const stock = await req(`/api/stock?branchId=${rama}`)
const fila = (Array.isArray(stock) ? stock : stock.productos || []).find((item) => item.id === producto.id)
assert.equal(Number(fila?.stock ?? 0), 0, 'el lote no mueve stock (solo la recepción lo hará)')

console.log(`PASS: ${envioUno.code} (bus) + ${envioDos.code} (importación) desde una compra · manifiesto con QR público · historial de ${imeiA} · stock intacto · ${checks} chequeos`)
