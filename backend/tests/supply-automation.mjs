import assert from 'node:assert/strict'

// #250 Fase 6 — Automatización: política de reposición (stock de seguridad +
// plazo), reposición sugerida que se convierte en necesidad sin duplicar,
// rendimiento por proveedor, tiempos de tránsito (CDE→ASU), alertas de atraso y
// AEX ampliado (cotización, guía y seguimiento del lote).
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
const ayer = new Date(Date.now() - 86400000).toISOString()

// 1) Política de reposición: stock de seguridad y plazo de entrega.
const producto = await req('/api/products', 'POST', { name: `Reposición ${sufijo}`, sku: `REP-${sufijo}`, pricePyg: 2500000, costPyg: 1800000, stock: 0, branchId: rama }, 201)
await req('/api/supply/policies', 'PUT', { productId: producto.id, branchId: rama, safetyStock: -1, leadTimeDays: 3 }, 400, admin)
await req('/api/supply/policies', 'PUT', { productId: producto.id, branchId: rama, safetyStock: 2.5, leadTimeDays: 3 }, 400, admin)
await req('/api/supply/policies', 'PUT', { productId: producto.id, branchId: rama, safetyStock: 2, leadTimeDays: 3 }, 200)
await req('/api/supply/policies', 'PUT', { productId: 'no-existe', branchId: rama, safetyStock: 1, leadTimeDays: 1 }, 404, admin)
const politica = await req(`/api/supply/policies?productId=${producto.id}&branchId=${rama}`)
assert.equal(politica.policies[0].safetyStock, 2)
assert.equal(politica.policies[0].leadTimeDays, 3)

// 2) Reposición sugerida: punto de pedido = seguridad + consumo × plazo.
const sugerencias = await req(`/api/supply/replenishment?branchId=${rama}&todas=1`)
const sugerida = sugerencias.sugerencias.find((fila) => fila.productId === producto.id)
assert.ok(sugerida, 'el producto con política aparece en la reposición sugerida')
assert.equal(sugerida.safetyStock, 2)
assert.equal(sugerida.leadTimeDays, 3)
assert.equal(sugerida.puntoPedido, 2, 'sin ventas el punto de pedido es el stock de seguridad')
assert.equal(sugerida.sugerida, 2)
assert.equal(sugerida.urgencia, 'ALTA', 'stock 0 bajo el colchón')
const soloFaltantes = await req(`/api/supply/replenishment?branchId=${rama}`)
assert.ok(soloFaltantes.sugerencias.some((fila) => fila.productId === producto.id), 'la sugerencia aparece en el listado por defecto')

// 3) La sugerencia se convierte en necesidad y repetirla no duplica.
const necesidad = await req('/api/supply/replenishment', 'POST', { productId: producto.id, branchId: rama }, 201)
assert.equal(necesidad.necesidad.source, 'BELOW_REORDER')
assert.equal(necesidad.necesidad.status, 'ABIERTA')
assert.equal(necesidad.necesidad.quantity, 2, 'pide lo que sugiere')
const repetida = await req('/api/supply/replenishment', 'POST', { productId: producto.id, branchId: rama })
assert.equal(repetida.repetida, true)
assert.equal(repetida.necesidad.id, necesidad.necesidad.id, 'la misma demanda no crea otra fila')
const trasPedir = await req(`/api/supply/replenishment?branchId=${rama}&todas=1`)
const ahoraCubierta = trasPedir.sugerencias.find((fila) => fila.productId === producto.id)
assert.equal(ahoraCubierta.abiertas, 2, 'lo pedido cuenta como abiertas')
assert.equal(ahoraCubierta.sugerida, 0, 'ya no sugiere comprar de nuevo')

// 4) Rendimiento por proveedor y tiempos de tránsito (los lotes de F4/F5 ya tienen salida y llegada).
const rendimiento = await req('/api/supply/performance')
assert.ok(rendimiento.proveedores.length >= 1, 'hay proveedores medidos')
const conCompras = rendimiento.proveedores.find((fila) => fila.compras >= 1)
assert.ok(conCompras && Number.isFinite(conCompras.costPyg), 'mide compras y monto')
const ruta = rendimiento.rutas.find((fila) => fila.origen === 'CDE' && fila.destino)
assert.ok(ruta, 'mide el tiempo de la ruta CDE → destino')
assert.ok(ruta.lotes >= 1, 'la ruta acumula lotes')
const conLlegada = rendimiento.rutas.find((fila) => fila.diasPromedio !== null)
assert.ok(conLlegada && conLlegada.diasPromedio >= 0, 'los lotes llegados promedian días')
// FIN: costo real por unidad del proveedor y puntualidad/atraso de la ruta.
const conUnidades = rendimiento.proveedores.find((fila) => fila.unidades >= 1)
assert.ok(conUnidades && Number.isFinite(conUnidades.costoPromedioUnidadPyg) && conUnidades.costoPromedioUnidadPyg >= 0, 'el costo real promedio por unidad se informa')
for (const fila of rendimiento.rutas) {
  assert.ok(fila.enTiempoPct === null || (fila.enTiempoPct >= 0 && fila.enTiempoPct <= 100), `puntualidad de ${fila.ruta} en rango`)
  assert.ok(fila.atrasoPromedioDias === null || fila.atrasoPromedioDias >= 0, `atraso de ${fila.ruta} no negativo`)
}

// 5) Alertas de atraso: lote con ETA vencida y necesidad con fecha prometida pasada.
const productoAtrasado = await req('/api/products', 'POST', { name: `Atraso ${sufijo}`, sku: `ATR-${sufijo}`, pricePyg: 1000000, costPyg: 700000, stock: 0, branchId: rama }, 201)
const compra = await req('/api/supply/purchases', 'POST', { supplierName: `Proveedor Atraso ${sufijo}`, currency: 'PYG', originalCost: 700000, lines: [{ productId: productoAtrasado.id, quantity: 1 }] }, 201)
const lote = await req('/api/supply/shipments', 'POST', { purchaseId: compra.id, origin: 'CDE', destinationBranchId: rama, method: 'BUS', company: 'Bus del Este', etaAt: ayer }, 201)
await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'prepare' })
await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'dispatch', guide: `G-ATR-${sufijo}` })
await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'transit' })
await req('/api/supply/needs', 'POST', { productId: productoAtrasado.id, quantity: 1, branchId: rama, priority: 'URGENTE', promisedAt: ayer }, 201)
const alertas = await req('/api/supply/alerts')
const atrasado = alertas.atrasados.find((fila) => fila.code === lote.code)
assert.ok(atrasado, 'el lote con ETA vencida aparece en las alertas')
assert.ok(atrasado.diasAtraso >= 1)
assert.equal(atrasado.compra, compra.code)
const vencida = alertas.necesidadesVencidas.find((fila) => fila.productId === productoAtrasado.id)
assert.ok(vencida, 'la necesidad con fecha prometida pasada aparece en las alertas')
assert.ok(vencida.diasVencidos >= 1)
assert.equal(vencida.prioridad, 'URGENTE')
const alertasRama = await req(`/api/supply/alerts?branchId=${rama}`)
assert.ok(alertasRama.atrasados.length >= 1, 'las alertas se filtran por sucursal')

// 6) AEX ampliado: cotización honesta sin credenciales, guía del lote y seguimiento.
const cotizacion = await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'aex-quote', pesoKg: 2 })
assert.equal(typeof cotizacion.unconfigured, 'boolean')
if (cotizacion.unconfigured) assert.ok(cotizacion.webUrl.includes('aex'), 'sin credenciales ofrece la web de AEX')
else assert.ok(Array.isArray(cotizacion.quotes))
await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'aex-quote', pesoKg: 0 }, 400, admin)
await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'aex-guide', guide: 'AB' }, 400, admin)
const conGuia = await req('/api/supply/shipments', 'PATCH', { id: lote.id, action: 'aex-guide', guide: `AEX-${sufijo}` })
assert.equal(conGuia.guide, `AEX-${sufijo}`)
assert.equal(conGuia.company, 'AEX')
assert.equal(conGuia.method, 'AEX')
const seguimiento = await req(`/api/supply/shipments/${lote.id}/tracking`)
assert.equal(seguimiento.guia, `AEX-${sufijo}`)
assert.ok(Array.isArray(seguimiento.events))
const auditoria = await req('/api/audit?action=SUPPLY_POLICY_UPDATED&limit=10')
const entradas = Array.isArray(auditoria) ? auditoria : auditoria?.entradas || auditoria?.rows || []
assert.ok(entradas.length >= 1, 'la política queda auditada')
const auditoriaAex = await req('/api/audit?action=SUPPLY_SHIPMENT_AEX_GUIDE&limit=10')
assert.ok((Array.isArray(auditoriaAex) ? auditoriaAex : auditoriaAex?.entradas || auditoriaAex?.rows || []).length >= 1, 'la guía AEX queda auditada')

// 7) Permisos.
await req('/api/supply/replenishment', 'GET', undefined, 401, 'token-invalido')
await req('/api/supply/performance', 'GET', undefined, 401, 'token-invalido')
await req('/api/supply/alerts', 'GET', undefined, 401, 'token-invalido')
if (vendedor) {
  await req('/api/supply/replenishment', 'GET', undefined, 403, vendedor)
  await req('/api/supply/policies', 'PUT', { productId: producto.id, branchId: rama, safetyStock: 1, leadTimeDays: 1 }, 403, vendedor)
}

console.log(`PASS: automatización de abastecimiento — política (seguridad 2 · 3 días), sugerencia ${sugerida.sugerida} → necesidad sin duplicar, ${rendimiento.proveedores.length} proveedores y ${rendimiento.rutas.length} rutas medidas, alertas (${alertas.atrasados.length} lotes atrasados, ${alertas.necesidadesVencidas.length} promesas vencidas) y AEX (guía + seguimiento) · ${checks} chequeos`)
