// Cotización por correo: envío con la outbox (relay .invalid del arnés: la cola
// registra el intento aunque la entrega falle), idempotencia por versión,
// reenvío explícito y cronología (historial de la cotización y ficha del
// cliente). También los caminos de error: sin correo y casilla inválida.
// Uso: node backend/tests/quote-email.mjs BASE_URL ADMIN_TOKEN [DATABASE_URL] [PG_BIN]

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, databaseUrl, pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: quote-email.mjs <baseUrl> <adminToken> [DATABASE_URL] [PG_BIN]')

const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }
const psql = (sql) => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
const filasCola = (quoteId) => psql(`SELECT COUNT(*) FROM "EmailOutbox" WHERE "aggregateType" = 'Quote' AND "aggregateId" = '${quoteId}' AND "kind" = 'quote';`)

// ── 1. Cliente con correo y cotización en borrador ─────────────────────────
let result = await request('/api/customers', 'POST', { name: `Cliente correo ${ts}`, email: `cotizacion-${ts}@example.invalid` })
assert.ok([200, 201].includes(result.response.status), JSON.stringify(result.payload))
const cliente = result.payload
result = await request('/api/quotes', 'POST', { customerId: cliente.id, customerName: cliente.name, items: [{ description: 'Equipo cotizado por correo', quantity: 1, unitPricePyg: 750000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const cotizacion = result.payload
assert.equal(cotizacion.status, 'DRAFT', 'la cotización nace en borrador')
assert.ok(cotizacion.publicToken, 'la cotización nace con enlace público')

// ── 2. Enviar: queda encolada y la cotización pasa a enviada ───────────────
result = await request(`/api/quotes/${encodeURIComponent(cotizacion.id)}/email`, 'POST', {})
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.to, cliente.email, 'usa el correo del cliente')
assert.ok(['enviado', 'encolado'].includes(result.payload.estado), `estado esperado enviado/encolado: ${JSON.stringify(result.payload)}`)
assert.equal(result.payload.cotizacion.status, 'SENT', 'queda marcada como enviada')
assert.ok(result.payload.link.includes(`/cotizacion/${cotizacion.publicToken}`), 'devuelve el enlace público usado')
const primerOutbox = result.payload.outboxId
assert.equal(filasCola(cotizacion.id), '1', 'la cola registra el envío')

// ── 3. Idempotencia: el mismo envío no se duplica ──────────────────────────
result = await request(`/api/quotes/${encodeURIComponent(cotizacion.id)}/email`, 'POST', {})
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.estado, 'duplicado', 'el segundo envío se detecta como duplicado')
assert.equal(result.payload.outboxId, primerOutbox, 'no crea otra fila en la cola')
assert.equal(filasCola(cotizacion.id), '1', 'sigue habiendo un solo envío')

// ── 4. Reenvío explícito: nueva fila ───────────────────────────────────────
result = await request(`/api/quotes/${encodeURIComponent(cotizacion.id)}/email`, 'POST', { forzar: true })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(['enviado', 'encolado'].includes(result.payload.estado), JSON.stringify(result.payload))
assert.notEqual(result.payload.outboxId, primerOutbox, 'el reenvío encola de nuevo')
assert.equal(filasCola(cotizacion.id), '2', 'quedan dos intentos registrados')

// ── 5. Cronología: historial de la cotización y ficha del cliente ──────────
result = await request(`/api/quotes/${encodeURIComponent(cotizacion.id)}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const eventos = result.payload.events || []
// El historial expone el texto legible de cada acción (no la acción cruda).
const envios = eventos.filter((evento) => evento.action === 'Enviada por correo')
assert.equal(envios.length, 2, `el historial muestra los dos envíos (no el duplicado): ${JSON.stringify(eventos.map((e) => e.action))}`)
assert.ok(envios.every((evento) => String(evento.detail || '').includes(cliente.email)), 'el detalle del historial muestra el destinatario')
assert.ok(eventos.some((evento) => evento.action === 'Estado actualizado' && /enviada/i.test(String(evento.detail || ''))), 'el historial muestra el cambio de estado')
assert.ok(eventos.some((evento) => evento.action === 'Correo no entregado'), 'el historial muestra el fallo de entrega del relay del arnés')

result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/timeline`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const cronologia = result.payload.events || []
assert.ok(cronologia.some((evento) => evento.action === 'QUOTE_EMAIL_SENT'), 'la ficha del cliente registra el envío')
assert.ok(cronologia.some((evento) => evento.action === 'QUOTE_EMAIL_SENT' && evento.label === 'Cotización enviada por correo'), 'la ficha muestra la etiqueta legible')

// ── 6. Sin correo: 400 con la marca para que la UI lo pida ─────────────────
result = await request('/api/customers', 'POST', { name: `Cliente sin correo ${ts}` })
assert.ok([200, 201].includes(result.response.status), JSON.stringify(result.payload))
const sinCorreo = result.payload
result = await request('/api/quotes', 'POST', { customerId: sinCorreo.id, customerName: sinCorreo.name, items: [{ description: 'Sin correo', quantity: 1, unitPricePyg: 1000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const cotizacionSinCorreo = result.payload
result = await request(`/api/quotes/${encodeURIComponent(cotizacionSinCorreo.id)}/email`, 'POST', {})
assert.equal(result.response.status, 400, JSON.stringify(result.payload))
assert.equal(result.payload.faltaEmail, true, 'la API avisa que falta el correo del cliente')
assert.equal(filasCola(cotizacionSinCorreo.id), '0', 'no encola nada sin correo')

// ── 7. Cotización sin ficha: se envía con un destino explícito ─────────────
result = await request('/api/quotes', 'POST', { customerName: `Cliente libre ${ts}`, items: [{ description: 'Cliente libre', quantity: 1, unitPricePyg: 2000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const libre = result.payload
result = await request(`/api/quotes/${encodeURIComponent(libre.id)}/email`, 'POST', { to: 'destino-libre@example.invalid' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.to, 'destino-libre@example.invalid', 'respeta el destino explícito')
result = await request(`/api/quotes/${encodeURIComponent(libre.id)}/email`, 'POST', { to: 'no-es-mail' })
assert.equal(result.response.status, 400, JSON.stringify(result.payload))

console.log('quote-email: envío, idempotencia, reenvío, cronología y errores ok')
