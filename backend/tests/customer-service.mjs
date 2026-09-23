#!/usr/bin/env node

// #240 §4 — El cliente ve su equipo en el taller:
// - la ficha del cliente suma la orden de servicio (estado, fechas y precio);
// - la cronología registra el ingreso y los cambios de estado en lenguaje de
//   cliente, sin filtrar costos ni datos internos;
// - el portal muestra estado y fechas, sin costos, notas ni técnico.
// Uso: node backend/tests/customer-service.mjs BASE_URL ADMIN_TOKEN [SELLER_TOKEN]

import assert from 'node:assert/strict'

const [base, admin, sellerToken] = process.argv.slice(2)
if (!base || !admin) throw new Error('Uso: customer-service.mjs <baseUrl> <adminToken> [sellerToken]')

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

const marca = Date.now().toString(36).toUpperCase()
const serial = `AUR-SERV-${marca}`

// ── Cliente con una orden de servicio vinculada ─────────────────────────────
const cliente = await req('/api/customers', 'POST', { name: `Cliente taller ${marca}`, firstName: 'Taller' }, undefined, 201)
const orden = await req('/api/service-orders', 'POST', {
  customerId: cliente.id,
  customerName: cliente.name,
  device: 'iPhone 13 · 128 GB',
  serial,
  serviceName: 'Cambio de pantalla',
  reportedIssue: 'Pantalla rota',
  status: 'RECIBIDO',
  pricePyg: 800000,
  costPyg: 300000,
}, undefined, 201)
assert.ok(orden.id && orden.serviceNumber, `la orden de servicio queda creada: ${JSON.stringify(orden).slice(0, 200)}`)

// ── Ficha: la orden aparece con estado y precio ─────────────────────────────
let perfil = await req(`/api/customers/${encodeURIComponent(cliente.id)}`)
const enFicha = (perfil.serviceOrders || []).find((row) => row.id === orden.id)
assert.ok(enFicha, 'la ficha del cliente trae la orden del taller')
assert.equal(enFicha.status, 'RECIBIDO')
assert.equal(enFicha.pricePyg, 800000)
assert.equal(enFicha.device, 'iPhone 13 · 128 GB')

// ── Cronología: ingreso en lenguaje de cliente, sin costos ──────────────────
let cronologia = await req(`/api/customers/${encodeURIComponent(cliente.id)}/timeline?limit=50`)
const recibido = cronologia.events.find((event) => event.action === 'SERVICE_ORDER_CREATED')
assert.ok(recibido, 'la cronología registra el ingreso al taller')
assert.equal(recibido.label, 'Equipo en taller')
assert.equal(recibido.type, 'service')
assert.match(recibido.detail, /iPhone 13/)
assert.match(recibido.detail, /Recibido/)
assert.match(recibido.detail, /serial AUR-…?/i)
assert.ok(!/300000|800000/.test(recibido.detail), 'el evento no filtra montos internos')

// ── Cambio de estado: queda el recorrido "Recibido → Listo para retirar" ────
await req('/api/service-orders', 'PATCH', { id: orden.id, status: 'LISTO' }, undefined)
cronologia = await req(`/api/customers/${encodeURIComponent(cliente.id)}/timeline?limit=50`)
const cambio = cronologia.events.find((event) => event.action === 'SERVICE_ORDER_STATUS')
assert.ok(cambio, 'la cronología registra el cambio de estado del taller')
assert.equal(cambio.label, 'Estado del taller')
assert.match(cambio.detail, /Recibido → Listo para retirar/)

// ── Portal: el cliente ve estado y fechas, nunca costos ni datos internos ───
const portal = await req(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido' }, undefined)
assert.ok(portal.token, `el enlace del portal queda generado: ${JSON.stringify(portal).slice(0, 200)}`)
const cuenta = await req(`/api/portal/${encodeURIComponent(portal.token)}`)
const servicioPortal = (cuenta.servicios || []).find((row) => row.serviceNumber === orden.serviceNumber)
assert.ok(servicioPortal, 'el portal lista el servicio del cliente')
assert.equal(servicioPortal.statusLabel, 'Listo para retirar')
assert.equal(servicioPortal.device, 'iPhone 13 · 128 GB')
assert.ok(servicioPortal.receivedAt, 'el portal muestra cuándo ingresó')
const crudo = JSON.stringify(cuenta)
for (const prohibido of ['costPyg', 'unlockSecret', 'unlock', 'technicianName', 'technicianId', 'diagnosis', 'notes', 'pricePyg']) {
  assert.ok(!crudo.includes(prohibido), `el portal no debe exponer ${prohibido}`)
}

// ── Aislamiento: otro cliente no ve la orden ajena ──────────────────────────
const ajeno = await req('/api/customers', 'POST', { name: `Cliente ajeno taller ${marca}` }, undefined, 201)
const perfilAjeno = await req(`/api/customers/${encodeURIComponent(ajeno.id)}`)
assert.equal((perfilAjeno.serviceOrders || []).length, 0, 'la orden no se filtra a otro cliente')

console.log(`PASS: taller en ficha, cronología y portal (${orden.serviceNumber})`)
