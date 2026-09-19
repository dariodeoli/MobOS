// Puentes e impresoras por HTTP: alta, pairing, permisos, import idempotente,
// tope por empresa y manifest del instalador. Corre dentro del arnés temporal.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, sellerToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !databaseUrl) throw new Error('Uso: print-bridge-http.mjs <baseUrl> <adminToken> <sellerToken> <databaseUrl>')
const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = sql => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

async function request(path, { method = 'GET', body, token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const headers = {}
  if (token !== null) headers.Authorization = `Bearer ${token}`
  if (tenant) headers['x-tenant-id'] = tenant
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

const codigoValido = codigo => /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(String(codigo))

// 1. Permisos: sesión para listar, ADMIN para crear.
let resultado = await request('/api/print/bridges', { token: null })
assert.equal(resultado.status, 401, 'sin sesión la lista de puentes exige 401')
resultado = await request('/api/print/bridges', { token: sellerToken })
assert.equal(resultado.status, 200, 'un vendedor puede listar los puentes')
assert.ok(Array.isArray(resultado.payload.bridges), 'la lista devuelve bridges')
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente vendedor' }, token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no crea puentes')

// 2. Alta de puente: nombre obligatorio y código de un solo uso en la respuesta.
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: '   ' } })
assert.equal(resultado.status, 400, 'el nombre vacío se rechaza')
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente IT' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const puente = resultado.payload.bridge
const primerCodigo = resultado.payload.pairingCode
assert.ok(puente?.id && puente.name === 'Puente IT', 'el alta devuelve el puente creado')
assert.ok(codigoValido(primerCodigo), 'el código de vinculación usa el alfabeto Crockford')
assert.ok(new Date(resultado.payload.expiresAt).getTime() > Date.now(), 'el código vence en el futuro')
assert.ok(!JSON.stringify(resultado.payload).includes('tokenHash'), 'el alta nunca devuelve el hash del token')

resultado = await request('/api/print/bridges')
const listado = resultado.payload.bridges.find(item => item.id === puente.id)
assert.ok(listado, 'el puente aparece en la lista')
assert.equal(listado.online, false, 'sin latidos el puente no está online')
assert.ok(!JSON.stringify(resultado.payload).includes('tokenHash'), 'la lista nunca devuelve el hash del token')

// 3. Regeneración del código: uno nuevo, distinto del anterior.
resultado = await request('/api/print/bridges/puente-inexistente/pairing', { method: 'POST' })
assert.equal(resultado.status, 404, 'regenerar un puente ajeno o inexistente da 404')
resultado = await request(`/api/print/bridges/${puente.id}/pairing`, { method: 'POST' })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.ok(codigoValido(resultado.payload.pairingCode), 'el código regenerado es válido')
assert.notEqual(resultado.payload.pairingCode, primerCodigo, 'el código regenerado es distinto')

// 4. Impresoras: ADMIN, destino único, estado final coherente.
resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Caja', destination: 'lan:10.0.0.5:9100' }, token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no crea impresoras')
resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Caja' } })
assert.equal(resultado.status, 400, 'sin destino la impresora se rechaza')
resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Caja', destination: 'lan:10.0.0.5:9100', bridgeId: puente.id, width: 58, copies: 2, density: 4 } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const impresora = resultado.payload
assert.equal(impresora.connection, 'lan', 'la conexión se deduce del destino')
assert.equal(impresora.width, 58)
assert.equal(impresora.bridgeId, puente.id, 'la impresora queda asignada al puente')
resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Caja 2', destination: 'lan:10.0.0.5:9100' } })
assert.equal(resultado.status, 409, 'el destino repetido da 409')

resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Mostrador', destination: 'cups:IT_CAJA', isDefault: true } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const segunda = resultado.payload

resultado = await request('/api/print/printers')
assert.equal(resultado.status, 200)
assert.equal(resultado.payload.printers.length, 2, 'la empresa ve sus dos impresoras')
assert.ok(resultado.payload.bridges.some(item => item.id === puente.id), 'la empresa ve sus puentes activos')
assert.equal(resultado.payload.remoteEnabled, true, 'sin kill switch la impresión remota está encendida')
assert.ok(!JSON.stringify(resultado.payload).includes('tokenHash'), 'la config nunca devuelve el hash del token')

resultado = await request(`/api/print/printers/${impresora.id}`, { method: 'PATCH', body: { name: 'Caja principal', isDefault: true } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.name, 'Caja principal')
assert.equal(resultado.payload.isDefault, true, 'el PATCH marca la predeterminada')
resultado = await request('/api/print/printers')
assert.equal(resultado.payload.printers.filter(item => item.isDefault).length, 1, 'solo queda una impresora predeterminada')
resultado = await request('/api/print/printers/puente-inexistente', { method: 'PATCH', body: { name: 'Nada' } })
assert.equal(resultado.status, 404, 'editar una impresora inexistente da 404')
resultado = await request(`/api/print/printers/${impresora.id}`, { method: 'PATCH', body: { destination: 'ftp:roto' } })
assert.equal(resultado.status, 400, 'el PATCH valida el destino')
resultado = await request(`/api/print/printers/${segunda.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 200, 'la baja responde ok')
resultado = await request(`/api/print/printers/${segunda.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 404, 'la segunda baja da 404')

// 5. Import legacy: 409 sin force, idempotente con force y con mapa de ids.
const importBody = {
  printers: [{ id: 'local-1', nombre: 'Importada', marca: 'Epson', destino: 'lan:10.0.0.9:9100', ancho: 58, copias: 1, predeterminada: true }],
  bridges: [{ id: 'local-puente-1', nombre: 'Puente local', predeterminado: true }],
}
resultado = await request('/api/print/printers/import', { method: 'POST', body: importBody })
assert.equal(resultado.status, 409, 'importar dos veces sin force da 409')
resultado = await request('/api/print/printers/import', { method: 'POST', body: { ...importBody, force: true } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.ok(resultado.payload.map?.printers?.['local-1'], 'el mapa devuelve el id del backend para la impresora')
assert.ok(resultado.payload.map?.bridges?.['local-puente-1'], 'el mapa devuelve el id del backend para el puente')
const totalTrasImport = (await request('/api/print/printers')).payload.printers.length
const puentesTrasImport = (await request('/api/print/bridges')).payload.bridges.length
resultado = await request('/api/print/printers/import', { method: 'POST', body: { ...importBody, force: true } })
assert.equal(resultado.status, 200, 'reaplicar el import con force no falla')
assert.equal((await request('/api/print/printers')).payload.printers.length, totalTrasImport, 'el import repetido no duplica impresoras')
assert.equal((await request('/api/print/bridges')).payload.bridges.length, puentesTrasImport, 'el import repetido no duplica puentes')

// 6. Revocación: el puente desaparece y su código ya no se regenera.
resultado = await request(`/api/print/bridges/${puente.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_BRIDGE_REVOKED' AND "entityId" = '${puente.id}';`), '1', 'la revocación queda auditada')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_BRIDGE_CREATED' AND "entityId" = '${puente.id}';`), '1', 'el alta queda auditada')
resultado = await request('/api/print/bridges')
assert.ok(!resultado.payload.bridges.some(item => item.id === puente.id), 'el puente revocado no se lista')
resultado = await request(`/api/print/bridges/${puente.id}/pairing`, { method: 'POST' })
assert.equal(resultado.status, 409, 'un puente revocado no regenera código')
resultado = await request(`/api/print/bridges/${puente.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 404, 'revocar de nuevo da 404')

// 7. Tope de puentes por empresa: 20 activos, el 21.º da 429.
const activos = Number(psql(`SELECT COUNT(*) FROM "PrintBridge" WHERE "tenantId" = 'tenant-a-it' AND "revokedAt" IS NULL;`))
psql(`INSERT INTO "PrintBridge" ("id", "tenantId", "name", "tokenHash", "updatedAt") SELECT 'it-cap-' || serie, 'tenant-a-it', 'Cap ' || serie, md5('cap-' || serie || clock_timestamp()::text), CURRENT_TIMESTAMP FROM generate_series(1, ${20 - activos}) serie;`)
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente de más' } })
assert.equal(resultado.status, 429, `con 20 puentes activos el alta da 429 (había ${activos})`)

// 8. Manifest del instalador: 503 sin artefacto publicado; 200 con contrato completo.
const manifest = await fetch(`${baseUrl}/api/print-agent/manifest`)
if (manifest.status === 503) {
  assert.equal(manifest.status, 503, 'sin artefacto el manifest avisa 503')
} else {
  assert.equal(manifest.status, 200, 'el manifest responde 200 cuando el artefacto existe')
  const cuerpo = await manifest.json()
  assert.ok(cuerpo.version && cuerpo.file && /^[a-f0-9]{64}$/i.test(cuerpo.sha256) && cuerpo.size > 0 && cuerpo.installUrl, 'el manifest publica versión, archivo, checksum, tamaño e installUrl')
}

console.log('print-bridge-http: puentes, impresoras, import idempotente, tope y manifest OK.')
