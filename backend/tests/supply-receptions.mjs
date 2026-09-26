import assert from 'node:assert/strict'

// #250 Fase 5 — Recepción: llegadas pendientes (por QR del manifiesto), escaneo
// de IMEI contra lo esperado, faltantes/sobrantes/dañados/incorrectos con nota,
// depósito destino y **alta en stock solo al confirmar**.
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
// IMEI propios y únicos de esta corrida (Luhn válido).
function imeiValido(base14) {
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base14[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base14 + String((10 - (suma % 10)) % 10)
}
const base14 = `4901542${String(Date.now()).slice(-7)}`
const imeiA = imeiValido(base14)
const imeiB = imeiValido(String(Number(base14) + 1).padStart(14, '0'))
const imeiExtra = imeiValido(String(Number(base14) + 2).padStart(14, '0'))

async function prepararLote(cantidad, seriales) {
  const producto = await req('/api/products', 'POST', { name: `Recepción ${sufijo} ${cantidad}`, sku: `REC-${sufijo}-${cantidad}`, pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: rama }, 201)
  const compra = await req('/api/supply/purchases', 'POST', {
    supplierName: `Proveedor Recepción ${sufijo}`,
    currency: 'PYG',
    originalCost: 1500000 * cantidad,
    lines: [{ productId: producto.id, quantity: cantidad, ...(seriales.length ? { serials: seriales } : {}) }],
  }, 201)
  const lote = await req('/api/supply/shipments', 'POST', { purchaseId: compra.id, origin: 'CDE', destinationBranchId: rama, method: 'BUS', company: 'Bus del Este', etaAt: '2026-09-25T10:00:00.000Z' }, 201)
  await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'prepare' })
  await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'dispatch', guide: `G-${sufijo}` })
  await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'transit' })
  return { producto, compra, lote }
}

// 1) Llegada pendiente: aparece con lo esperado y el depósito sugerido.
const deposito = await req('/api/stock-locations', 'POST', { branchId: rama, name: `Depósito F5 ${sufijo}`, code: 'F5' }, 201)
const uno = await prepararLote(2, [imeiA])
const pendientes = await req('/api/supply/receptions?pendientes=1')
const llegada = pendientes.llegadas.find((fila) => fila.id === uno.lote.id)
assert.ok(llegada, 'el lote en tránsito aparece en «Llegadas pendientes»')
assert.equal(llegada.unidades, 2)
assert.equal(llegada.conImei, 1)
assert.equal(llegada.pendientes, 1, 'una unidad viaja con IMEI diferido')
assert.equal(llegada.ubicacionSugerida?.id, deposito.id, 'la llegada sugiere el depósito de la sucursal')
const depositoId = deposito.id

// 2) La recepción se abre desde el QR del manifiesto (token) y se retoma sin duplicar.
const manifiesto = await req(`/api/supply/shipments/${uno.lote.id}/manifest`)
const token = manifiesto.enlace.split('/envio/')[1]
const abierta = await req('/api/supply/receptions', 'POST', { token }, 201)
assert.equal(abierta.recepcion.status, 'BORRADOR')
assert.equal(abierta.esperados.length, 2)
const retomada = await req('/api/supply/receptions', 'POST', { shipmentId: uno.lote.id })
assert.equal(retomada.recepcion.id, abierta.recepcion.id, 'la recepción abierta se retoma')
assert.equal(retomada.retomada, true)
const recepcionId = abierta.recepcion.id

// 3) Sin confirmar no hay stock: el escaneo solo registra.
await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'scan', serial: imeiA }, 201, admin)
await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'scan', serial: imeiB }, 201, admin)
const unidadesAntes = await req(`/api/inventory-units?q=${imeiA}`)
assert.equal((Array.isArray(unidadesAntes) ? unidadesAntes : unidadesAntes.units || []).length, 0, 'el escaneo no crea stock')
const stockAntes = await req(`/api/stock?branchId=${rama}`)
assert.equal(Number((Array.isArray(stockAntes) ? stockAntes : stockAntes.productos || []).find((item) => item.id === uno.producto.id)?.stock ?? 0), 0, 'el escaneo no mueve stock')

// 4) Sobrante e incidencias con nota.
const conSobrante = await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'scan', serial: imeiExtra }, 201, admin)
assert.equal(conSobrante.resumen.SOBRANTE, 1)
const sobrante = conSobrante.recepcion.items.find((item) => item.resultado === 'SOBRANTE')
await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'item', itemId: sobrante.id, resultado: 'SOBRANTE' }, 400, admin)
const conNota = await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'item', itemId: sobrante.id, resultado: 'SOBRANTE', nota: 'Llegó un equipo que no figuraba en el manifiesto' })
assert.equal(conNota.item.nota.length > 0, true)
await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'scan', serial: imeiA }, 400, admin)

// 5) Confirmar: recién ahí nace el stock de las unidades RECIBIDAS.
const confirmada = await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'confirm', locationId: depositoId })
assert.equal(confirmada.recepcion.status, 'CONFIRMADA')
assert.equal(confirmada.unidadesCreadas, 2, 'solo las dos unidades recibidas entran al stock')
assert.equal(confirmada.estadoLote, 'CON_INCIDENCIA', 'el sobrante deja el lote con incidencia')
assert.equal(confirmada.resumen.RECIBIDO, 2)
assert.equal(confirmada.resumen.SOBRANTE, 1)

const unidades = await req(`/api/inventory-units?q=${imeiA}`)
const lista = Array.isArray(unidades) ? unidades : unidades.units || []
const creada = lista.find((unidad) => unidad.serial === imeiA)
assert.ok(creada, 'la unidad recibida está en el inventario')
assert.equal(creada.branchId, rama)
assert.equal(creada.locationId, depositoId, 'quedó en el depósito elegido')
assert.equal(Number(creada.costPyg), 1500000, 'hereda el costo de la compra')
const otra = (await req(`/api/inventory-units?q=${imeiB}`))
assert.ok((Array.isArray(otra) ? otra : otra.units || []).some((unidad) => unidad.serial === imeiB), 'el IMEI diferido se completó al recibir')

// El historial del serial ya la muestra en stock, con su lote.
const historial = await req(`/api/supply/serials/${imeiA}`)
assert.equal(historial.enStock, true)
assert.equal(historial.lotes[0].envio, uno.lote.code)

// 6) Faltante: se confirma parcial y el lote queda RECEPCION_PARCIAL sin stock del faltante.
const dos = await prepararLote(2, [imeiExtra])
const abiertaDos = await req('/api/supply/receptions', 'POST', { shipmentId: dos.lote.id }, 201)
await req('/api/supply/receptions', 'PATCH', { id: abiertaDos.recepcion.id, action: 'scan', serial: imeiExtra }, 201, admin)
const parcial = await req('/api/supply/receptions', 'PATCH', { id: abiertaDos.recepcion.id, action: 'confirm', locationId: depositoId })
assert.equal(parcial.estadoLote, 'RECEPCION_PARCIAL')
assert.equal(parcial.resumen.FALTANTE, 1)
assert.equal(parcial.unidadesCreadas, 1)
const stockDos = await req(`/api/stock?branchId=${rama}`)
assert.equal(Number((Array.isArray(stockDos) ? stockDos : stockDos.productos || []).find((item) => item.id === dos.producto.id)?.stock ?? 0), 1, 'solo lo recibido suma stock')

// 6-bis) Costos/moneda (FIN #254): una compra en USD con costo por línea llega
// a la unidad con el costo convertido y la moneda/cotización congeladas.
const productoTres = await req('/api/products', 'POST', { name: `Recepción USD ${sufijo}`, sku: `RECUSD-${sufijo}`, pricePyg: 3000000, costPyg: 2000000, stock: 0, branchId: rama }, 201)
const imeiUsd = imeiValido(String(Number(base14) + 3).padStart(14, '0'))
const compraUsd = await req('/api/supply/purchases', 'POST', {
  supplierName: `Proveedor USA ${sufijo}`,
  currency: 'USD',
  exchangeRatePyg: 7500,
  lines: [{ productId: productoTres.id, quantity: 1, originalUnitCost: 900 }],
}, 201)
assert.equal(Number(compraUsd.lines[0].unitCostPyg), 900 * 7500, 'la línea convierte el costo de la compra')
assert.equal(Number(compraUsd.costPyg), 900 * 7500, 'sin total explícito, el total sale de la línea')
const loteUsd = await req('/api/supply/shipments', 'POST', { purchaseId: compraUsd.id, origin: 'USA', destinationBranchId: rama, method: 'BUS', company: 'Bus USD', etaAt: '2026-09-27T10:00:00.000Z' }, 201)
await req('/api/supply/shipments', 'PATCH', { id: loteUsd.id, action: 'prepare' })
await req('/api/supply/shipments', 'PATCH', { id: loteUsd.id, action: 'dispatch', guide: `GUSD-${sufijo}` })
await req('/api/supply/shipments', 'PATCH', { id: loteUsd.id, action: 'transit' })
const recepcionUsd = await req('/api/supply/receptions', 'POST', { shipmentId: loteUsd.id }, 201)
await req('/api/supply/receptions', 'PATCH', { id: recepcionUsd.recepcion.id, action: 'scan', serial: imeiUsd }, 201, admin)
const confirmadaUsd = await req('/api/supply/receptions', 'PATCH', { id: recepcionUsd.recepcion.id, action: 'confirm', locationId: depositoId })
assert.equal(confirmadaUsd.unidadesCreadas, 1)
const unidadesUsd = await req(`/api/inventory-units?q=${imeiUsd}`)
const unidadUsd = (Array.isArray(unidadesUsd) ? unidadesUsd : unidadesUsd.units || []).find((unidad) => unidad.serial === imeiUsd)
assert.ok(unidadUsd, 'la unidad comprada en USD está en el inventario')
assert.equal(Number(unidadUsd.costPyg), 900 * 7500, 'la unidad llega con el costo convertido')
assert.equal(unidadUsd.costCurrency, 'USD', 'la moneda del costo queda congelada en la unidad')
assert.equal(Number(unidadUsd.exchangeRatePyg), 7500, 'la cotización queda congelada en la unidad')
assert.equal(Number(unidadUsd.originalCost), 900, 'el costo original se conserva')

// 7) Una recepción cerrada no se vuelve a confirmar ni escanear.
await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'scan', serial: 'AUR-9' }, 409, admin)
await req('/api/supply/receptions', 'PATCH', { id: recepcionId, action: 'confirm', locationId: depositoId }, 409, admin)

// 8) Auditoría, permisos y validaciones.
const auditoria = await req('/api/audit?action=SUPPLY_RECEPTION_CONFIRMED&limit=10')
const entradas = Array.isArray(auditoria) ? auditoria : auditoria?.entradas || auditoria?.rows || []
assert.ok(entradas.length >= 2, 'las confirmaciones quedan auditadas')
await req('/api/supply/receptions?pendientes=1', 'GET', undefined, 401, 'token-invalido')
if (vendedor) await req('/api/supply/receptions?pendientes=1', 'GET', undefined, 403, vendedor)
await req('/api/supply/receptions', 'POST', { shipmentId: 'no-existe' }, 404, admin)
await req('/api/supply/receptions', 'POST', {}, 400, admin)

console.log(`PASS: recepción por QR de ${uno.lote.code} — 2 recibidas (1 IMEI diferido completado) + sobrante con nota · ${dos.lote.code} con faltante (parcial) · stock solo al confirmar · ${checks} chequeos`)
