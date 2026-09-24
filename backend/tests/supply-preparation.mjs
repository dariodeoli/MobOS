import assert from 'node:assert/strict'

// #250 Fase 3 — IMEI y preparación: escaneo de a uno (mobile), pegado múltiple,
// cuadre del lote (Luhn, repetidos, duplicados globales y cantidad vs
// comprada), IMEI diferido y etiquetas de la preparación. Sigue sin tocar
// stock: solo la recepción lo hará.
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
const imeiA = '490154203237609'
const imeiB = '490154203237617'
const imeiC = '490154203237625'
const imeiD = '490154203237633'

// 1) Producto sin stock, necesidad y compra de 3 unidades sin IMEI (diferido).
const producto = await req('/api/products', 'POST', { name: `Preparación A ${sufijo}`, model: 'iPhone 15 Pro Max', sku: `PREP-A-${sufijo}`, pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: rama }, 201)
const necesidad = await req('/api/supply/needs', 'POST', { productId: producto.id, quantity: 3, branchId: rama, priority: 'ALTA' }, 201)
const compra = await req('/api/supply/purchases', 'POST', {
  supplierName: `Proveedor Prep ${sufijo}`,
  currency: 'PYG',
  originalCost: 4500000,
  reference: `FAC-PREP-${sufijo}`,
  lines: [{ needId: necesidad.id, productId: producto.id, quantity: 3 }],
}, 201)
const linea = compra.lines[0]
assert.equal(linea.serials.length, 0, 'la compra arranca con IMEI diferido')

// 2) Preparación pendiente: el filtro y las etiquetas lo dicen.
const pendientes = await req('/api/supply/purchases?pendientes=1')
const enFiltro = pendientes.compras.find((fila) => fila.id === compra.id)
assert.ok(enFiltro, 'la compra con IMEI pendiente aparece en el filtro')
assert.equal(enFiltro.lines[0].faltan, 3)
assert.equal(pendientes.totales.pendientes >= 3, true)
const etiquetasInicial = await req(`/api/supply/purchases/${compra.id}/labels`)
assert.equal(etiquetasInicial.etiquetas.length, 3)
assert.equal(etiquetasInicial.resumen.pendientes, 3)
assert.deepEqual(etiquetasInicial.etiquetas.map((etiqueta) => etiqueta.n), [1, 2, 3])
assert.ok(etiquetasInicial.etiquetas.every((etiqueta) => etiqueta.pendiente && etiqueta.compra === compra.code))

// 3) Escaneo móvil de a uno: dos unidades entran y la tercera queda pendiente.
const escaneoA = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'scan', lineId: linea.id, serial: imeiA })
assert.equal(escaneoA.agregados, 1)
assert.equal(escaneoA.aviso ?? null, null, 'sin consulta previa del IMEI no hay aviso de modelo')
const escaneoB = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'scan', productId: producto.id, serial: imeiB })
assert.equal(escaneoB.agregados, 1, 'el escaneo puede apuntar por producto a la línea con lugar')
const etiquetasParcial = await req(`/api/supply/purchases/${compra.id}/labels`)
assert.equal(etiquetasParcial.resumen.conImei, 2)
assert.equal(etiquetasParcial.resumen.pendientes, 1)
assert.equal(etiquetasParcial.etiquetas.filter((etiqueta) => etiqueta.pendiente).length, 1)
assert.deepEqual(etiquetasParcial.etiquetas.map((etiqueta) => etiqueta.imei), [imeiA, imeiB, null])

// 4) Cuadre del lote: Luhn, repetidos, ya cargado y cantidad vs comprada.
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'scan', lineId: linea.id, serial: '490154203237610' }, 400)
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'scan', lineId: linea.id, serial: imeiA }, 400)
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'serials', lineId: linea.id, serials: [imeiC, imeiC] }, 400) // repetido en el lote
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'serials', lineId: linea.id, serials: [imeiC, imeiD] }, 400, admin)
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'scan', lineId: 'no-existe', serial: imeiC }, 404)
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'scan' }, 400)

// Duplicado global: otra compra con el mismo IMEI.
const compraB = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor B', lines: [{ productId: producto.id, quantity: 1 }] }, 201)
await req('/api/supply/purchases', 'PATCH', { id: compraB.id, action: 'scan', lineId: compraB.lines[0].id, serial: imeiA }, 409)
// IMEI que ya está en el inventario.
await req('/api/inventory-units', 'POST', { productId: producto.id, branchId: rama, serial: imeiD, condition: 'NEW' }, 201)
await req('/api/supply/purchases', 'PATCH', { id: compraB.id, action: 'scan', lineId: compraB.lines[0].id, serial: imeiD }, 409)

// 5) Pegado múltiple: completa el restante de la primera compra.
const completada = await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'serials', lineId: linea.id, serials: `${imeiC}\n` })
assert.equal(completada.lines[0].serials.length, 3)
const finales = await req('/api/supply/purchases?pendientes=1')
assert.ok(!finales.compras.some((fila) => fila.id === compra.id), 'sin IMEI pendientes sale del filtro')

// 6) Aviso de modelo: el IMEI consultado figura como otro modelo.
const imeiOtro = '490154203237641'
const requestId = `qa-250f3-${Date.now()}`
await req('/api/imei', 'POST', { action: 'checks', imei: imeiOtro, servicio: 'APPLE_BASIC', confirm: true, requestId }, 201)
// El modelo detectado llega con la conciliación del panel del proveedor.
await req('/api/imei', 'POST', { action: 'conciliar', requestId, status: 'verificado', costUsd: 0.06, normalized: [{ clave: 'modelo', etiqueta: 'Modelo', valor: 'iPhone 13' }], note: 'Panel del proveedor' }, 200)
const compraC = await req('/api/supply/purchases', 'POST', { supplierName: 'Proveedor C', lines: [{ productId: producto.id, quantity: 1 }] }, 201)
const conAviso = await req('/api/supply/purchases', 'PATCH', { id: compraC.id, action: 'scan', lineId: compraC.lines[0].id, serial: imeiOtro })
assert.ok(conAviso.aviso && /figura como/.test(conAviso.aviso), 'el aviso de modelo distinto viaja en la respuesta')

// 7) Auditoría del escaneo y permisos.
const auditoria = await req('/api/audit?action=SUPPLY_PURCHASE_SERIALS_ADDED&limit=50')
const entradas = Array.isArray(auditoria) ? auditoria : auditoria?.entradas || auditoria?.rows || []
assert.ok(entradas.length > 0, 'los IMEI cargados quedan auditados')
await req('/api/supply/purchases', 'PATCH', { id: compra.id, action: 'scan', lineId: linea.id, serial: 'AUR-9' }, 401, 'token-invalido')
if (vendedor) await req(`/api/supply/purchases/${compra.id}/labels`, 'GET', undefined, 403, vendedor)

// 8) Nada tocó el stock (solo la unidad del inventario que se creó aparte).
const stock = await req(`/api/stock?branchId=${rama}`)
const fila = (Array.isArray(stock) ? stock : stock.productos || []).find((item) => item.id === producto.id)
assert.equal(Number(fila?.stock ?? 0), 1, 'la preparación no mueve stock (solo la recepción lo hará)')

console.log(`PASS: preparación de ${compra.code} — escaneo de a uno, pegado múltiple, cuadre del lote, IMEI diferido, aviso de modelo y etiquetas 3 de 3 · ${checks} chequeos`)
