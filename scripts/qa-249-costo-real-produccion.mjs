#!/usr/bin/env node
// #249 · Cadena de costo real en producción (solo lectura):
// unidad inspeccionada (repuestos/reparaciones) → costo real de la línea
// (base + repuestos + seguro) → margen del reporte que usa ese costo.
//
// Producción (no escribe nada; requiere una sesión real exportada):
//   MOBOS_QA_STORAGE_STATE=/tmp/mobos-qa.json node scripts/qa-249-costo-real-produccion.mjs
//   (npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login)
//
// Arnés/sandbox (prueba ejecutable; permite sembrar el escenario con SEMBRAR):
//   MOBOS_QA_API_URL=http://127.0.0.1:3115 MOBOS_QA_TOKEN=<admin> MOBOS_QA_SEMBRAR=1 \
//     node scripts/qa-249-costo-real-produccion.mjs
//
// Sale 0 solo si verificó una venta real de una unidad con repuestos; si no hay
// datos (o solo hay unidades en stock) sale 1 con el motivo, sin inventar verde.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const API = String(process.env.MOBOS_QA_API_URL || 'https://api.moboss.online').replace(/\/$/, '')
const OUT = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/qa/249-costo-real-prod')
const SEMBRAR = process.env.MOBOS_QA_SEMBRAR === '1'
mkdirSync(OUT, { recursive: true })

const esLocal = /localhost|127\.0\.0\.1/.test(API)
if (SEMBRAR && !esLocal) {
  console.error('MOBOS_QA_SEMBRAR solo se permite contra un backend local: producción es siempre de solo lectura.')
  process.exit(2)
}

const estado = String(process.env.MOBOS_QA_STORAGE_STATE || '')
const token = String(process.env.MOBOS_QA_TOKEN || '')
if (!token && !estado) {
  console.error('Falta MOBOS_QA_STORAGE_STATE (producción) o MOBOS_QA_TOKEN (arnés): la verificación no inventa datos.')
  process.exit(2)
}
const cabeceras = token
  ? { Authorization: `Bearer ${token}` }
  : { Cookie: (JSON.parse(readFileSync(estado, 'utf8')).cookies || []).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') }

const evidencia = { api: API, cuando: new Date().toISOString(), modo: SEMBRAR ? 'sandbox con escenario sembrado' : 'solo lectura', checks: 0, verificado: false }
let checks = 0

async function api(path, { method = 'GET', body, esperado = 200 } = {}) {
  const respuesta = await fetch(`${API}${path}`, {
    method,
    headers: { ...cabeceras, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await respuesta.json().catch(() => null)
  assert.equal(respuesta.status, esperado, `${method} ${path} → ${respuesta.status}: ${JSON.stringify(data).slice(0, 240)}`)
  checks += 1
  return data
}

const partesDe = (unidad) => {
  const valor = Number(unidad?.inspection?.costoRepuestosPyg)
  return Number.isSafeInteger(valor) && valor > 0 ? valor : 0
}
const listaDe = (data) => (Array.isArray(data) ? data : data?.units || [])

// ── 1) Buscar una unidad con repuestos: idealmente ya vendida ───────────────
const unidades = listaDe(await api('/api/inventory-units?limit=500'))
const vendidas = unidades.filter((unidad) => unidad.status === 'SOLD' && unidad.sale?.orderId && partesDe(unidad) > 0)
const enStock = unidades.filter((unidad) => unidad.status !== 'SOLD' && partesDe(unidad) > 0)
evidencia.unidades = { revisadas: unidades.length, vendidasConRepuestos: vendidas.length, enStockConRepuestos: enStock.length }

async function sembrar() {
  const ramas = listaDe(await api('/api/branches'))
  const rama = ramas.find((fila) => fila.isActive !== false) || ramas[0]
  assert.ok(rama, 'hay una sucursal para sembrar')
  const sufijo = Date.now().toString(36).toUpperCase()
  const serial = `994${Date.now().toString().slice(-12)}`
  const costoBase = 1000000
  const repuestos = 120000
  const precio = 2200000
  const producto = await api('/api/products', { method: 'POST', esperado: 201, body: { name: `QA costo real ${sufijo}`, sku: `QACR-${sufijo}`, pricePyg: precio, costPyg: costoBase, stock: 1, imei: serial, branchId: rama.id, condition: 'USED' } })
  const nuevas = listaDe(await api(`/api/inventory-units?q=${serial}`))
  const unidad = nuevas.find((fila) => fila.serial === serial)
  assert.ok(unidad, 'la unidad sembrada aparece en Inventario')
  await api('/api/inventory-units', { method: 'PATCH', body: { id: unidad.id, action: 'inspection', inspection: { items: [{ clave: 'pantalla', estado: 'falla', nota: 'No OEM' }], repuestosNoOem: 'Pantalla no original', costoRepuestosPyg: repuestos } } })
  const venta = await api('/api/orders', { method: 'POST', esperado: 201, body: { branchId: rama.id, items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: precio, inventoryUnitSerials: [serial] }], payments: [{ method: 'CASH', amountPyg: precio, status: 'CONFIRMED' }] } })
  evidencia.sembrado = { serial, productoId: producto.id, sku: producto.sku, orderId: venta.id, orderNumber: venta.orderNumber, costoBase, repuestos, precio, baseEsperada: costoBase + repuestos }
  return { ...unidad, costPyg: costoBase, inspection: { costoRepuestosPyg: repuestos }, sale: { orderId: venta.id, orderNumber: venta.orderNumber } }
}

let objetivo = vendidas[0] || null
if (!objetivo && SEMBRAR) objetivo = await sembrar()

if (!objetivo) {
  evidencia.motivo = enStock.length
    ? `Hay ${enStock.length} unidad(es) con repuestos en stock, pero ninguna vendida: falta la venta para verificar el margen.`
    : 'No hay unidades con repuestos (ni vendidas ni en stock) para verificar la cadena.'
  evidencia.ejemploEnStock = enStock[0] ? { serial: enStock[0].serial, costPyg: enStock[0].costPyg ?? null, repuestos: partesDe(enStock[0]) } : null
  writeFileSync(join(OUT, 'resultados.json'), JSON.stringify({ ...evidencia, checks }, null, 2))
  console.log(`SIN DATOS: ${evidencia.motivo}`)
  console.log(`Evidencia: ${join(OUT, 'resultados.json')}`)
  process.exit(1)
}

// ── 2) Verificar la línea de la venta: base + repuestos + seguro ────────────
const repuestos = partesDe(objetivo)
const consignacion = Number(objetivo.consignorPyg ?? 0)
const costoUnidad = objetivo.costPyg === null || objetivo.costPyg === undefined ? null : Number(objetivo.costPyg)
let costoProducto = objetivo.product?.costPyg === undefined ? null : objetivo.product?.costPyg
if (costoProducto === null && costoUnidad === null && !(Number.isSafeInteger(consignacion) && consignacion > 0)) {
  const productos = listaDe(await api(`/api/products?q=${encodeURIComponent(objetivo.product?.sku || objetivo.serial)}`))
  costoProducto = productos[0]?.costPyg ?? null
}
const baseEsperada = Number.isSafeInteger(consignacion) && consignacion > 0
  ? consignacion + repuestos
  : (costoUnidad !== null ? costoUnidad + repuestos : (costoProducto !== null && costoProducto !== undefined ? Number(costoProducto) + repuestos : null))

const orden = await api(`/api/orders/${objetivo.sale.orderId}`)
const linea = (orden.items || []).find((item) => Array.isArray(item.serials) && item.serials.includes(objetivo.serial))
assert.ok(linea, 'la línea de la venta incluye el serial de la unidad inspeccionada')
checks += 1
const base = linea.baseUnitCostPyg === null || linea.baseUnitCostPyg === undefined ? null : Number(linea.baseUnitCostPyg)
const seguro = Number(linea.insurancePyg ?? 0)
const extras = Number(linea.extraCostPyg ?? 0)
const costoLinea = linea.unitCostPyg === null || linea.unitCostPyg === undefined ? null : Number(linea.unitCostPyg)

evidencia.venta = {
  orderNumber: orden.orderNumber,
  serial: objetivo.serial,
  precio: Number(linea.totalPyg),
  baseUnitCostPyg: base,
  repuestos,
  insurancePyg: seguro,
  extraCostPyg: extras,
  unitCostPyg: costoLinea,
  baseEsperada,
}
if (baseEsperada !== null) {
  assert.equal(base, baseEsperada, `la base del costo (${base}) tiene que ser el costo de la unidad/consignación más los repuestos (${baseEsperada})`)
  checks += 1
}
assert.equal(costoLinea, (base ?? 0) + seguro + extras, `el costo real congelado (${costoLinea}) es base + seguro + extras`)
checks += 1
assert.ok(repuestos > 0, 'la unidad tiene repuestos/reparaciones cargados en la inspección')
checks += 1
const cantidad = Number(linea.quantity || 1)
const margenLinea = Number(linea.totalPyg) - (costoLinea ?? 0) * cantidad
assert.ok(Number.isSafeInteger(margenLinea), `la línea tiene margen calculable con su costo congelado (${margenLinea})`)
checks += 1
evidencia.venta.margenLinea = margenLinea
evidencia.verificado = true

// ── 3) El reporte de márgenes usa ese costo congelado ───────────────────────
// El reporte usa el día paraguayo (UTC-3): el día se calcula con ese corrimiento
// para que la venta caiga adentro del rango a cualquier hora local.
const OFFSET_PY = -180
const dia = new Date(new Date(orden.createdAt).getTime() + OFFSET_PY * 60_000).toISOString().slice(0, 10)
const reporte = await api(`/api/reports?from=${dia}&to=${dia}&groupBy=product&offsetMinutes=${OFFSET_PY}`)
const grupo = (reporte.groups || []).find((fila) => fila.key === (linea.productId || objetivo.productId))
assert.ok(grupo, 'el producto de la unidad aparece en el reporte del día')
checks += 1
assert.ok(Number(grupo.costPyg) >= (costoLinea ?? 0), `el costo del reporte (${grupo.costPyg}) incluye la línea con repuestos (${costoLinea})`)
checks += 1
if (evidencia.sembrado) {
  // Escenario propio: la venta es la única del producto, así que los números
  // del grupo son los de la línea.
  assert.equal(Number(grupo.costPyg), costoLinea, 'el reporte cuenta el costo real congelado de la venta')
  assert.equal(Number(grupo.totalPyg), Number(linea.totalPyg), 'el reporte cuenta la venta de la unidad')
  assert.equal(Number(grupo.profitPyg), Number(linea.totalPyg) - (costoLinea ?? 0), 'el margen del reporte es venta − costo real (con repuestos y seguro)')
  checks += 3
}
evidencia.reporte = { dia, productId: grupo.key, totalPyg: Number(grupo.totalPyg), costPyg: Number(grupo.costPyg), profitPyg: Number(grupo.profitPyg), linesWithoutCost: grupo.linesWithoutCost }

writeFileSync(join(OUT, 'resultados.json'), JSON.stringify({ ...evidencia, checks }, null, 2))
console.log(`PASS: ${orden.orderNumber} · ${objetivo.serial} · repuestos ${repuestos} → base ${base} + seguro ${seguro} = costo ${costoLinea} · margen de la línea ${margenLinea} · reporte: venta ${grupo.totalPyg} − costo ${grupo.costPyg} = margen ${grupo.profitPyg} · ${checks} comprobaciones`)
console.log(`Evidencia: ${join(OUT, 'resultados.json')}`)
