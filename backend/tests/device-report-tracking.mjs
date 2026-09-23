#!/usr/bin/env node

// #240 ítem 3 — Seguimiento del informe compartido (visto/no visto):
// - el envío desde la ficha abre la fila de seguimiento del equipo;
// - la primera apertura del link público marca «visto» (contador + evento en la
//   cronología del cliente) y las siguientes solo actualizan última apertura;
// - la vista previa de la app (`?preview=1`) no cuenta;
// - un equipo sin venta/cliente no deja rastro (la ruta pública no escribe).
// Uso: node backend/tests/device-report-tracking.mjs BASE_URL ADMIN_TOKEN [SELLER_TOKEN] [DATABASE_URL] [PG_BIN]

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const [base, admin, sellerToken, databaseUrl, pgBin] = process.argv.slice(2)
if (!base || !admin) throw new Error('Uso: device-report-tracking.mjs <baseUrl> <adminToken> [sellerToken] [databaseUrl] [pgBin]')

// El arnés corre este test con el token de vendedor; sin él, administración.
const seller = sellerToken || admin
async function req(path, method = 'GET', body, token = admin, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  return data
}

const rama = 'branch-a-it'
const marca = Date.now().toString(36).toUpperCase()
const serial = `993${Date.now().toString().slice(-12)}`
const serialSinVenta = `994${Date.now().toString().slice(-12)}`

function filaDe(perfil, buscado) {
  return (perfil.deviceReportShares || []).find((fila) => fila.serial === buscado.toUpperCase()) || null
}

// ── Equipo vendido a un cliente ─────────────────────────────────────────────
const producto = await req('/api/products', 'POST', { name: `Equipo seguimiento ${marca}`, sku: `SEG-${marca}`, pricePyg: 2000000, costPyg: 1000000, stock: 1, imei: serial, branchId: rama, condition: 'USED' }, undefined, 201)
const cliente = await req('/api/customers', 'POST', { name: `Cliente seguimiento ${marca}`, firstName: 'Cliente' }, undefined, 201)
const venta = await req('/api/orders', 'POST', {
  customerId: cliente.id,
  branchId: rama,
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 2000000, inventoryUnitSerials: [serial] }],
  payments: [{ method: 'CASH', amountPyg: 2000000, status: 'CONFIRMED' }],
}, undefined, 201)
assert.ok(venta.id, 'la venta de prueba queda creada')

// El serial viaja en minúsculas a propósito: la fila de seguimiento normaliza.
let perfil = await req(`/api/customers/${encodeURIComponent(cliente.id)}`)
assert.equal(filaDe(perfil, serial), null, 'antes de compartir no hay seguimiento')

const envio = await req(`/api/customers/${encodeURIComponent(cliente.id)}/device-report`, 'POST', { serial: serial.toLowerCase(), model: producto.name, canal: 'WHATSAPP' }, seller)
assert.equal(envio.canal, 'WHATSAPP', 'el envío queda registrado por WhatsApp')

perfil = await req(`/api/customers/${encodeURIComponent(cliente.id)}`)
const compartido = filaDe(perfil, serial)
assert.ok(compartido, 'el envío crea la fila de seguimiento')
assert.equal(compartido.channel, 'WHATSAPP')
assert.ok(compartido.sharedAt, 'la fila guarda cuándo se compartió')
assert.equal(compartido.firstViewedAt, null, 'todavía no está visto')
assert.equal(compartido.viewCount, 0)

// ── Vista previa de la app: no cuenta ───────────────────────────────────────
const preview = await req(`/api/public/units/${encodeURIComponent(serial)}?preview=1`)
assert.ok(preview.store?.name, 'la vista previa devuelve el informe igual')
perfil = await req(`/api/customers/${encodeURIComponent(cliente.id)}`)
assert.equal(filaDe(perfil, serial).firstViewedAt, null, 'la vista previa no marca visto')

// ── Aperturas del cliente: la primera marca visto y anota el evento ─────────
const primera = await req(`/api/public/units/${encodeURIComponent(serial)}`)
assert.ok(primera.unit?.serialMasked, 'el informe público sigue abriendo')
const segunda = await req(`/api/public/units/${encodeURIComponent(serial)}`)
assert.ok(segunda.unit?.serialMasked)

perfil = await req(`/api/customers/${encodeURIComponent(cliente.id)}`)
const visto = filaDe(perfil, serial)
assert.ok(visto.firstViewedAt, 'la apertura marca visto')
assert.ok(visto.lastViewedAt, 'la fila guarda la última apertura')
assert.equal(visto.viewCount, 2, 'las dos aperturas cuentan en el contador')
assert.ok(new Date(visto.lastViewedAt) >= new Date(visto.firstViewedAt))

const cronologia = await req(`/api/customers/${encodeURIComponent(cliente.id)}/timeline?limit=50`)
const eventosVisto = cronologia.events.filter((event) => event.action === 'CUSTOMER_DEVICE_REPORT_VIEWED')
assert.equal(eventosVisto.length, 1, 'una sola apertura queda en la cronología, no una por visita')
assert.equal(eventosVisto[0].label, 'Informe del equipo visto por el cliente')
assert.match(eventosVisto[0].detail, /abierto desde el enlace de WhatsApp/)
assert.ok(!eventosVisto[0].detail.includes(serial), 'la cronología enmascara el serial')
assert.ok(cronologia.events.some((event) => event.action === 'CUSTOMER_DEVICE_REPORT_SHARED'), 'el envío sigue en la cronología')

// ── Abierto desde el portal sin envío previo ────────────────────────────────
const serialPortal = `995${Date.now().toString().slice(-12)}`
const productoPortal = await req('/api/products', 'POST', { name: `Equipo portal ${marca}`, sku: `SEGP-${marca}`, pricePyg: 1500000, costPyg: 800000, stock: 1, imei: serialPortal, branchId: rama, condition: 'USED' }, undefined, 201)
const clientePortal = await req('/api/customers', 'POST', { name: `Cliente portal ${marca}`, firstName: 'Portal' }, undefined, 201)
await req('/api/orders', 'POST', {
  customerId: clientePortal.id,
  branchId: rama,
  items: [{ productId: productoPortal.id, description: productoPortal.name, quantity: 1, unitPricePyg: 1500000, inventoryUnitSerials: [serialPortal] }],
  payments: [{ method: 'CASH', amountPyg: 1500000, status: 'CONFIRMED' }],
}, undefined, 201)
await req(`/api/public/units/${encodeURIComponent(serialPortal)}`)
const perfilPortal = await req(`/api/customers/${encodeURIComponent(clientePortal.id)}`)
const vistoPortal = filaDe(perfilPortal, serialPortal)
assert.ok(vistoPortal?.firstViewedAt, 'abrir desde el portal también marca visto')
assert.equal(vistoPortal.channel, null, 'sin envío previo el canal queda vacío')
const cronologiaPortal = await req(`/api/customers/${encodeURIComponent(clientePortal.id)}/timeline?limit=50`)
const eventoPortal = cronologiaPortal.events.find((event) => event.action === 'CUSTOMER_DEVICE_REPORT_VIEWED')
assert.ok(eventoPortal, 'el portal anota el evento en la cronología')
assert.match(eventoPortal.detail, /abierto desde el portal del cliente/)

// ── Equipo sin venta: la ruta pública no escribe ────────────────────────────
await req('/api/products', 'POST', { name: `Equipo suelto ${marca}`, sku: `SEGS-${marca}`, pricePyg: 500000, costPyg: 300000, stock: 1, imei: serialSinVenta, branchId: rama, condition: 'NEW' }, admin, 201)
await req(`/api/public/units/${encodeURIComponent(serialSinVenta)}?preview=1`)
await req(`/api/public/units/${encodeURIComponent(serialSinVenta)}`)
if (databaseUrl && pgBin) {
  const psql = (sql) => execFileSync(`${pgBin}/psql`, [databaseUrl, '-At', '-c', sql], { encoding: 'utf8' }).trim()
  assert.equal(psql(`SELECT COUNT(*) FROM "DeviceReportShare" WHERE "serial" IN ('${serialSinVenta.toUpperCase()}', '${serialSinVenta.toLowerCase()}')`), '0', 'un equipo sin cliente no deja fila de seguimiento')
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE action = 'CUSTOMER_DEVICE_REPORT_VIEWED' AND metadata->>'serial' = '${serialSinVenta.toUpperCase()}'`), '0', 'tampoco deja evento')
}

// ── Aislamiento: el seguimiento no se mezcla entre clientes ─────────────────
assert.equal(filaDe(perfilPortal, serial), null, 'cada cliente ve solo su equipo')
assert.equal(filaDe(perfil, serialPortal), null, 'el cliente original no ve el equipo del otro')

console.log(`PASS: seguimiento del informe (visto/no visto) con serial ${serial.slice(0, 4)}…${serial.slice(-3)}`)
