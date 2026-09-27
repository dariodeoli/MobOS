// A3 (#279) · Aprobación autenticada de presupuestos: versión congelada, OTP por
// correo (el código se lee de la outbox real, descifrada) y evidencia con hash.
// También cubre los negatives: teléfono sin relay, código incorrecto, reuso,
// versión cambiada y cotización ya convertida.
//
// Uso: node backend/tests/quote-approval-otp.mjs BASE_URL ADMIN_TOKEN DATABASE_URL PG_BIN
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [baseUrl, adminToken, databaseUrl, pgBinArg] = process.argv.slice(2)
if (!baseUrl || !adminToken || !databaseUrl) throw new Error('Uso: quote-approval-otp.mjs <baseUrl> <adminToken> <databaseUrl> [pgBin]')
const pgBin = pgBinArg || process.env.PG_BIN || '/opt/homebrew/bin'
const backend = dirname(dirname(fileURLToPath(import.meta.url)))

// La outbox del arnés usa esta clave (ver integration-http.sh); se descifra con
// la misma librería del backend transpilada, sin duplicar el sobre.
process.env.MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID ||= 'it-v1'
process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON ||= '{"it-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}'
const require = createRequire(import.meta.url)
const ts = require('typescript')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, path)
const { decryptEmailOutboxPayload } = require('../lib/email-outbox-crypto.ts')

const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }
const firmaPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
let checks = 0
const ok = (condicion, etiqueta) => { assert.ok(condicion, etiqueta); checks++ }

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  return { response, payload: await response.json().catch(() => null) }
}

async function publicRequest(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  return { response, payload: await response.json().catch(() => null) }
}

const sqlLiteral = (valor) => `'${String(valor).replace(/'/g, "''")}'`
const psql = (sql) => execFileSync(`${pgBin}/psql`, ['-X', '-A', '-t', '-c', sql, databaseUrl], { encoding: 'utf8' }).trim()

/** Código del último correo OTP de la cotización, leído y descifrado. */
function codigoOtpDeOutbox(quoteId) {
  ok(/^[a-z0-9]+$/.test(quoteId), 'el id de cotización es seguro para SQL')
  const fila = psql(`SELECT row_to_json(t) FROM (SELECT "id","tenantId","kind","recipient","aggregateType","aggregateId","idempotencyKey",payload FROM "EmailOutbox" WHERE "aggregateId" = ${sqlLiteral(quoteId)} AND "kind" = 'quote-approval-otp' ORDER BY "createdAt" DESC LIMIT 1) t`)
  ok(fila, `hay un correo OTP encolado para ${quoteId}`)
  const job = JSON.parse(fila)
  const mensaje = decryptEmailOutboxPayload(job.payload, job)
  const match = String(mensaje.text || '').match(/Código:\s*(\d{6})/)
  ok(match, 'el correo trae el código de 6 dígitos')
  return { codigo: match[1], destinatario: job.recipient, subject: mensaje.subject }
}

const ts0 = Date.now()

// ── Cotización con cliente real (correo cargado) ───────────────────────────
const cliente = await request('/api/customers', 'POST', { name: `Cliente OTP ${ts0}`, phone: '0981555000', countryCode: '+595', email: `aprobacion+${ts0}@example.invalid` })
assert.equal(cliente.response.status, 201, JSON.stringify(cliente.payload))
const clienteId = cliente.payload.id

const creada = await request('/api/quotes', 'POST', { customerId: clienteId, customerName: cliente.payload.name, validUntil: new Date(Date.now() + 3 * 86400000).toISOString(), items: [{ description: 'Equipo con aprobación', quantity: 2, unitPricePyg: 4000000 }], discountPyg: 500000 })
assert.equal(creada.response.status, 201, JSON.stringify(creada.payload))
const quote = creada.payload
ok(quote.publicToken, 'la cotización nace con enlace público')

let vista = await publicRequest(`/api/quotes/public/${encodeURIComponent(quote.publicToken)}`)
assert.equal(vista.response.status, 200, JSON.stringify(vista.payload))
ok(vista.payload.version && /^[a-f0-9]{64}$/.test(vista.payload.version.hash), 'el enlace muestra la versión congelada con hash')
ok(vista.payload.otp.canales.email === true, 'el correo está disponible como canal')
ok(vista.payload.otp.canales.phone === false, 'sin relay SMS el teléfono no está disponible')
ok(vista.payload.otp.email.includes('***'), 'el correo se muestra enmascarado')
ok(vista.payload.approval === null, 'todavía no hay aprobación')

// Teléfono sin relay: se informa, no se finge.
const porTelefono = await publicRequest(`/api/quotes/public/${encodeURIComponent(quote.publicToken)}/otp`, 'POST', { channel: 'PHONE', version: vista.payload.version.number })
assert.equal(porTelefono.response.status, 409, JSON.stringify(porTelefono.payload))

// ── OTP por correo ─────────────────────────────────────────────────────────
const otp = await publicRequest(`/api/quotes/public/${encodeURIComponent(quote.publicToken)}/otp`, 'POST', { channel: 'EMAIL', version: vista.payload.version.number })
assert.equal(otp.response.status, 201, JSON.stringify(otp.payload))
ok(otp.payload.challengeId, 'el desafío se emite')
ok(otp.payload.destination.includes('***'), 'el destino se devuelve enmascarado')
ok(typeof otp.payload.enviado === 'boolean', 'el envío informa si el transporte lo tomó')

const { codigo } = codigoOtpDeOutbox(quote.id)

// Código incorrecto: intento contado, sin consumir el desafío.
const incorrecto = await publicRequest(`/api/quotes/public/${encodeURIComponent(quote.publicToken)}/approve`, 'POST', { challengeId: otp.payload.challengeId, code: codigo === '000000' ? '111111' : '000000' })
assert.equal(incorrecto.response.status, 401, JSON.stringify(incorrecto.payload))
ok(/incorrecto/i.test(incorrecto.payload.message), 'el error explica el código incorrecto')
const intentos = psql(`SELECT "attempts" FROM "QuoteApprovalChallenge" WHERE "id" = ${sqlLiteral(otp.payload.challengeId)}`)
ok(Number(intentos) === 1, 'el intento fallido queda contado')

// Código correcto: evidencia + pedido.
const aprobada = await publicRequest(`/api/quotes/public/${encodeURIComponent(quote.publicToken)}/approve`, 'POST', { challengeId: otp.payload.challengeId, code: codigo, signerName: 'Titular OTP', signerDocument: '80012345-6', signature: firmaPng })
assert.equal(aprobada.response.status, 201, JSON.stringify(aprobada.payload))
ok(aprobada.payload.orderNumber, 'la aprobación crea el pedido')
ok(aprobada.payload.evidence.versionHash === vista.payload.version.hash, 'la evidencia apunta al hash de la versión revisada')
ok(aprobada.payload.evidence.method === 'OTP_EMAIL', 'la evidencia registra el método')
ok(aprobada.payload.evidence.firmo === true, 'la firma opcional queda registrada')

const pedido = await request(`/api/orders/${encodeURIComponent(aprobada.payload.orderId)}`)
assert.equal(pedido.response.status, 200, JSON.stringify(pedido.payload))
ok(Number(pedido.payload.totalPyg) === 7500000, 'el pedido toma el total congelado (2 × 4.000.000 − 500.000)')
ok(pedido.payload.items.length === 1 && Number(pedido.payload.items[0].quantity) === 2, 'el pedido toma los ítems congelados')

const evidencia = JSON.parse(psql(`SELECT row_to_json(t) FROM (SELECT "versionHash","method","destination","signerName","orderId","signatureDataUrl","ipHash" FROM "QuoteApproval" WHERE "quoteId" = ${sqlLiteral(quote.id)} ORDER BY "createdAt" DESC LIMIT 1) t`))
ok(evidencia.versionHash === vista.payload.version.hash, 'la evidencia persiste el hash de la versión')
ok(evidencia.method === 'OTP_EMAIL' && evidencia.destination.includes('***'), 'la evidencia guarda método y destino enmascarado')
ok(evidencia.signerName === 'Titular OTP' && evidencia.orderId === aprobada.payload.orderId, 'la evidencia liga firmante y pedido')
ok(String(evidencia.signatureDataUrl).startsWith('data:image/png;base64,'), 'la firma se guarda como PNG')
ok(evidencia.ipHash === null || /^[a-f0-9]{64}$/.test(evidencia.ipHash), 'la IP se guarda hasheada (o sin dato)')
const auditado = psql(`SELECT count(*) FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND action = 'QUOTE_APPROVED' AND "entityId" = ${sqlLiteral(quote.id)}`)
ok(Number(auditado) === 1, 'la aprobación queda en la auditoría')

const resuelta = await publicRequest(`/api/quotes/public/${encodeURIComponent(quote.publicToken)}`)
assert.equal(resuelta.payload.status, 'CONVERTED', JSON.stringify(resuelta.payload))
ok(resuelta.payload.approval?.orderNumber === aprobada.payload.orderNumber, 'la página muestra la evidencia y el pedido')

// Reuso y doble resolución.
const reuso = await publicRequest(`/api/quotes/public/${encodeURIComponent(quote.publicToken)}/approve`, 'POST', { challengeId: otp.payload.challengeId, code: codigo })
assert.equal(reuso.response.status, 409, JSON.stringify(reuso.payload))
ok(/pedido|nuevo|código/i.test(reuso.payload.message), 'el reuso se rechaza con un motivo claro')

// ── Versión cambiada entre el código y la aprobación ──────────────────────
const otra = await request('/api/quotes', 'POST', { customerId: clienteId, customerName: cliente.payload.name, items: [{ description: 'Equipo cambiante', quantity: 1, unitPricePyg: 1000000 }] })
assert.equal(otra.response.status, 201, JSON.stringify(otra.payload))
const quoteB = otra.payload
const vistaB = await publicRequest(`/api/quotes/public/${encodeURIComponent(quoteB.publicToken)}`)
const otpB = await publicRequest(`/api/quotes/public/${encodeURIComponent(quoteB.publicToken)}/otp`, 'POST', { channel: 'EMAIL', version: vistaB.payload.version.number })
assert.equal(otpB.response.status, 201, JSON.stringify(otpB.payload))
const { codigo: codigoB } = codigoOtpDeOutbox(quoteB.id)

// La tienda edita la cotización: el enlace ya congelado pasa a v2.
const editada = await request('/api/quotes', 'PATCH', { id: quoteB.id, notes: 'Condiciones nuevas' })
assert.equal(editada.response.status, 200, JSON.stringify(editada.payload))
const vistaB2 = await publicRequest(`/api/quotes/public/${encodeURIComponent(quoteB.publicToken)}`)
ok(vistaB2.payload.version.number === 2 && vistaB2.payload.version.hash !== vistaB.payload.version.hash, 'editar después de compartir congela una versión nueva')

const codigoViejo = await publicRequest(`/api/quotes/public/${encodeURIComponent(quoteB.publicToken)}/approve`, 'POST', { challengeId: otpB.payload.challengeId, code: codigoB })
assert.equal(codigoViejo.response.status, 409, JSON.stringify(codigoViejo.payload))
ok(/cambió|nueva/i.test(codigoViejo.payload.message), 'no se aprueba una versión que ya no es la vigente')

const clienteViejo = await publicRequest(`/api/quotes/public/${encodeURIComponent(quoteB.publicToken)}/otp`, 'POST', { channel: 'EMAIL', version: 1 })
assert.equal(clienteViejo.response.status, 409, 'la página desactualizada no puede pedir código')

// La pestaña actualizada pide un código nuevo: se limpian los desafíos viejos
// para no chocar con el minuto anti-spam (el reloj lo controla el test).
psql(`DELETE FROM "QuoteApprovalChallenge" WHERE "quoteId" = ${sqlLiteral(quoteB.id)}`)
const otpB2 = await publicRequest(`/api/quotes/public/${encodeURIComponent(quoteB.publicToken)}/otp`, 'POST', { channel: 'EMAIL', version: 2 })
assert.equal(otpB2.response.status, 201, JSON.stringify(otpB2.payload))
const { codigo: codigoB2 } = codigoOtpDeOutbox(quoteB.id)
const aprobadaB = await publicRequest(`/api/quotes/public/${encodeURIComponent(quoteB.publicToken)}/approve`, 'POST', { challengeId: otpB2.payload.challengeId, code: codigoB2 })
assert.equal(aprobadaB.response.status, 201, JSON.stringify(aprobadaB.payload))
ok(aprobadaB.payload.evidence.version === 2, 'la aprobación nueva corresponde a la v2')

// ── La aceptación rápida legacy sigue viva (sin pedido) ───────────────────
const rapida = await request('/api/quotes', 'POST', { customerName: `Cliente rápido ${ts0}`, items: [{ description: 'Ítem rápido', quantity: 1, unitPricePyg: 500000 }] })
const aceptada = await publicRequest(`/api/quotes/public/${encodeURIComponent(rapida.payload.publicToken)}`, 'POST', { action: 'accept' })
assert.equal(aceptada.response.status, 200, JSON.stringify(aceptada.payload))
ok(aceptada.payload.status === 'ACCEPTED', 'la aceptación sin código sigue disponible para enlaces legacy')
const conv = await publicRequest(`/api/quotes/public/${encodeURIComponent(rapida.payload.publicToken)}`)
ok(conv.payload.approval === null, 'la aceptación rápida no inventa evidencia de OTP')

console.log(`PASS: aprobación autenticada de presupuestos — versión congelada, OTP por correo, evidencia y pedido · ${checks} chequeos`)
