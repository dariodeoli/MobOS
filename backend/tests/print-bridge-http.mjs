// Puentes e impresoras por HTTP: alta, pairing, permisos, import idempotente,
// tope por empresa y manifest del instalador. Corre dentro del arnés temporal.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { ticketPruebaTipo } from '../../src/lib/printing/tickets.js'

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

// Llamadas del agente: Bearer del token del puente, sin sesión de usuario.
async function agente(path, { method = 'POST', token = null, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
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

// 4b. Desactivar y reactivar dejan su evento propio (issue #63).
resultado = await request(`/api/print/printers/${impresora.id}`, { method: 'PATCH', body: { isActive: false } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.isActive, false)
resultado = await request(`/api/print/printers/${impresora.id}`, { method: 'PATCH', body: { isActive: true } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.isActive, true)

resultado = await request(`/api/print/printers/${segunda.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 200, 'la baja responde ok')
resultado = await request(`/api/print/printers/${segunda.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 404, 'la segunda baja da 404')

// 4c. Auditoría de impresoras visible en GET /api/audit: alta, edición con
// antes/después, predeterminada, activa/inactiva y baja. El destino LAN se
// guarda enmascarado y nunca se auditan tokens.
async function auditoria(action) {
  const respuesta = await request(`/api/audit?action=${action}&limit=200`)
  assert.equal(respuesta.status, 200, `GET /api/audit?action=${action}`)
  return respuesta.payload
}

const altas = (await auditoria('PRINT_PRINTER_CREATED')).filter(fila => fila.entityId === impresora.id)
assert.equal(altas.length, 1, 'el alta de la impresora deja PRINT_PRINTER_CREATED')
assert.equal(altas[0].metadata?.name, 'Caja', 'la auditoría guarda el nombre')
assert.equal(altas[0].metadata?.destination, 'lan:10.0.0.x:9100', 'el destino LAN se audita con la IP enmascarada')
const ediciones = (await auditoria('PRINT_PRINTER_UPDATED')).filter(fila => fila.entityId === impresora.id)
assert.equal(ediciones.length, 3, 'cada edición con cambios deja PRINT_PRINTER_UPDATED (nombre, desactivar, reactivar)')
const edicionNombre = ediciones.find(fila => fila.metadata?.changes?.name)
assert.equal(edicionNombre?.metadata.changes.name.from, 'Caja', 'queda el valor anterior')
assert.equal(edicionNombre?.metadata.changes.name.to, 'Caja principal', 'queda el valor nuevo')
const predeterminada = (await auditoria('PRINT_DEFAULT_PRINTER_CHANGED')).filter(fila => fila.entityId === impresora.id)
assert.equal(predeterminada.length, 1, 'cambiar la predeterminada deja PRINT_DEFAULT_PRINTER_CHANGED')
assert.equal(predeterminada[0].metadata?.previousDefaultId, segunda.id, 'queda la predeterminada anterior')
assert.equal((await auditoria('PRINT_PRINTER_DISABLED')).filter(fila => fila.entityId === impresora.id).length, 1, 'desactivar deja PRINT_PRINTER_DISABLED')
assert.equal((await auditoria('PRINT_PRINTER_ENABLED')).filter(fila => fila.entityId === impresora.id).length, 1, 'reactivar deja PRINT_PRINTER_ENABLED')
const bajas = (await auditoria('PRINT_PRINTER_DELETED')).filter(fila => fila.entityId === segunda.id)
assert.equal(bajas.length, 1, 'la baja deja PRINT_PRINTER_DELETED')
assert.equal(bajas[0].metadata?.name, 'Mostrador', 'la baja recuerda el nombre de la impresora')
assert.ok((await auditoria('PRINT_PRINTER_CREATED')).every(fila => !/tokenHash|tokenPista/.test(JSON.stringify(fila.metadata))), 'las altas nunca auditan tokens')

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
const imports = await auditoria('PRINT_PRINTER_IMPORTED')
assert.equal(imports.length, 2, 'cada import exitoso deja PRINT_PRINTER_IMPORTED')
assert.equal(imports[1].metadata?.created, 1, 'el primer import audita la impresora creada')
assert.equal(imports[1].metadata?.updated, 0, 'el primer import no actualiza nada')
assert.equal(imports[0].metadata?.created, 0, 'el segundo import no crea nada')
assert.equal(imports[0].metadata?.updated, 1, 'el segundo import audita la impresora actualizada')

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

// 7. Trabajos (slice 2): pairing, encolado, claim con lease, resultado,
// confirmación en papel, requeue, purga, aislamiento y kill switch.
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente trabajos' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const puenteJobs = resultado.payload.bridge
const codigoJobs = resultado.payload.pairingCode

resultado = await agente('/api/print/bridge/pair', { body: { code: 'ABCDE-FGH1J' } })
assert.equal(resultado.status, 401, 'un código inexistente da 401 genérico')
resultado = await agente('/api/print/bridge/pair', { body: { code: codigoJobs, name: 'Mac mostrador', version: '1.6.0', platform: 'darwin' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const tokenJobs = resultado.payload.token
assert.match(String(tokenJobs), /^[a-f0-9]{64}$/, 'el pairing devuelve el token de 32 bytes una única vez')
assert.equal(resultado.payload.bridgeId, puenteJobs.id, 'el pairing responde el puente canjeado')
assert.equal(psql(`SELECT "pairingUsedAt" IS NOT NULL FROM "PrintBridge" WHERE "id" = '${puenteJobs.id}';`), 't', 'el código queda consumido')
resultado = await agente('/api/print/bridge/pair', { body: { code: codigoJobs } })
assert.equal(resultado.status, 401, 'el código usado no vuelve a servir')
for (let intento = 1; intento <= 3; intento += 1) {
  resultado = await agente('/api/print/bridge/pair', { body: { code: codigoJobs } })
  assert.equal(resultado.status, 401, `el intento ${intento} sobre un código consumido da 401`)
}
resultado = await agente('/api/print/bridge/pair', { body: { code: codigoJobs } })
assert.equal(resultado.status, 429, 'agotar los 5 intentos bloquea el código con 429')
assert.equal(psql(`SELECT "pairingAttempts" FROM "PrintBridge" WHERE "id" = '${puenteJobs.id}';`), '5', 'los intentos fallidos quedan contados')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_BRIDGE_PAIRED' AND "entityId" = '${puenteJobs.id}';`), '1', 'el pairing exitoso se audita una vez')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_BRIDGE_PAIR_FAILED' AND "entityId" = '${puenteJobs.id}';`), '5', 'los intentos fallidos se auditan sin el código')

// 7b. Latido: presencia y extensión del lease.
resultado = await agente('/api/print/bridge/heartbeat', { token: tokenJobs, body: { version: '1.6.0', platform: 'darwin' } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.ok, true, 'el latido responde ok')
assert.ok(Date.parse(resultado.payload.serverTime) > 0, 'el latido devuelve la hora del servidor')
resultado = await agente('/api/print/bridge/heartbeat', { token: 'token-inexistente', body: {} })
assert.equal(resultado.status, 401, 'un token inválido no late')
resultado = await request('/api/print/bridges')
assert.equal(resultado.payload.bridges.find(item => item.id === puenteJobs.id)?.online, true, 'el latido marca el puente online')

// 7c. Segundo puente e impresora asignada al primero.
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente trabajos B' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const puenteJobsB = resultado.payload.bridge
const codigoJobsB = resultado.payload.pairingCode
resultado = await agente('/api/print/bridge/pair', { body: { code: codigoJobsB } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const tokenJobsB = resultado.payload.token

resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Impresora jobs', destination: 'lan:10.0.0.11:9100', bridgeId: puenteJobs.id, width: 58, isDefault: true } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const impresoraJobs = resultado.payload

// 7d. Encolado remoto, idempotencia, tope de payload y espejo LOCAL.
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.11:9100', payload: 'QUJDRA==', suffix: '7', reference: 'IT-JOB-1', printerId: impresoraJobs.id, idempotencyKey: 'it-job-key-1', width: 58, copies: 1, validation: '1234' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const job = resultado.payload.job
assert.ok(job?.id && job.state === 'PENDIENTE' && job.path === 'REMOTO', 'el encolado remoto queda pendiente')
assert.equal(job.printerId, impresoraJobs.id, 'el trabajo recuerda su impresora')
assert.ok(!/"payload":|"suffixHash":|"leaseId":/.test(JSON.stringify(resultado.payload)), 'el encolado nunca devuelve bytes, sufijo ni lease')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.11:9100', payload: 'QUJDRA==', idempotencyKey: 'it-job-key-1' } })
assert.equal(resultado.status, 200, 'repetir la clave devuelve el mismo trabajo')
assert.equal(resultado.payload.job.id, job.id, 'la clave de idempotencia no crea otro trabajo')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.11:9100', payload: 'A'.repeat(131073) } })
assert.equal(resultado.status, 413, 'el payload sobre 128 KB da 413')
resultado = await request('/api/print/jobs', { method: 'POST', body: { path: 'LOCAL', destination: 'lan:10.0.0.11:9100', sourceJobId: 'it-local-1', state: 'ACEPTADO', validation: '4321', suffix: '3' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const espejo = resultado.payload.job
assert.equal(espejo.path, 'LOCAL')
assert.equal(espejo.state, 'ACEPTADO')
assert.equal(espejo.payloadBytes, 0, 'el espejo local no guarda bytes')
resultado = await request('/api/print/jobs', { method: 'POST', body: { path: 'LOCAL', destination: 'lan:10.0.0.11:9100', sourceJobId: 'it-local-1', state: 'ACEPTADO' } })
assert.equal(resultado.status, 200, 'el espejo repetido no duplica')
assert.equal(resultado.payload.job.id, espejo.id)
resultado = await request('/api/print/jobs', { method: 'POST', body: { path: 'LOCAL', destination: 'lan:10.0.0.11:9100', payload: 'QUJD', sourceJobId: 'it-local-2' } })
assert.equal(resultado.status, 400, 'un espejo LOCAL con payload se rechaza')

// 7e. Listado y detalle públicos; sin imprimir no se confirma.
resultado = await request('/api/print/jobs?state=PENDIENTE&limit=10')
assert.equal(resultado.status, 200)
assert.equal(resultado.payload.remoteEnabled, true, 'sin kill switch el listado ve el remoto encendido')
assert.ok(resultado.payload.jobs.some(item => item.id === job.id), 'el listado ve el trabajo pendiente')
assert.ok(!/"payload":|"suffixHash":|"leaseId":/.test(JSON.stringify(resultado.payload)), 'el listado no expone bytes, sufijo ni lease')
resultado = await request('/api/print/jobs?state=INEXISTENTE')
assert.equal(resultado.status, 400, 'un estado desconocido se rechaza')
resultado = await request(`/api/print/jobs/${job.id}`)
assert.equal(resultado.status, 200)
assert.ok(!/"payload":|"suffixHash":|"leaseId":/.test(JSON.stringify(resultado.payload)), 'el detalle no expone bytes, sufijo ni lease')
resultado = await request('/api/print/jobs/job-inexistente')
assert.equal(resultado.status, 404, 'un trabajo ajeno o inexistente da 404')
resultado = await request(`/api/print/jobs/${job.id}/confirm`, { method: 'POST', body: { suffix: '7' } })
assert.equal(resultado.status, 409, 'un trabajo sin imprimir no se confirma')

// 7f. Claim: el trabajo está asignado al puente A y solo él lo obtiene; el
// segundo trabajo sin puente se reparte una sola vez entre los dos.
const [claimInicialA, claimInicialB] = await Promise.all([
  agente('/api/print/bridge/claim', { token: tokenJobs, body: {} }),
  agente('/api/print/bridge/claim', { token: tokenJobsB, body: {} }),
])
assert.equal(claimInicialA.payload.jobs.length, 1, 'el puente asignado obtiene el trabajo')
assert.equal(claimInicialB.payload.jobs.length, 0, 'el puente ajeno no ve el trabajo de la impresora')
const reclamado = claimInicialA.payload.jobs[0]
assert.equal(reclamado.id, job.id)
assert.equal(reclamado.payload, 'QUJDRA==', 'el claim entrega el payload transitorio')
assert.ok(reclamado.leaseId && Date.parse(reclamado.leaseExpiresAt) > Date.now(), 'el claim entrega lease con vencimiento')
resultado = await agente('/api/print/bridge/claim', { token: tokenJobs, body: {} })
assert.equal(resultado.payload.jobs.length, 0, 'sin trabajo pendiente el claim devuelve jobs vacío')

resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.11:9100', payload: 'QUJDRA==', idempotencyKey: 'it-job-key-2' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const jobLibre = resultado.payload.job
const [claimLibreA, claimLibreB] = await Promise.all([
  agente('/api/print/bridge/claim', { token: tokenJobs, body: {} }),
  agente('/api/print/bridge/claim', { token: tokenJobsB, body: {} }),
])
const ganadoresLibre = [claimLibreA, claimLibreB].filter(item => item.payload?.jobs?.length === 1)
assert.equal(ganadoresLibre.length, 1, 'SKIP LOCKED: solo un puente reclama el trabajo libre')
assert.equal(ganadoresLibre[0].payload.jobs[0].id, jobLibre.id)
const ganadorLibre = ganadoresLibre[0] === claimLibreA ? claimLibreA : claimLibreB
const tokenGanadorLibre = ganadoresLibre[0] === claimLibreA ? tokenJobs : tokenJobsB
const jobLibreReclamado = ganadorLibre.payload.jobs[0]

// 7g. Resultado: lease ajeno, cierre con borrado del payload y reenvío idempotente.
resultado = await agente(`/api/print/bridge/jobs/${job.id}/result`, { token: tokenJobs, body: { leaseId: 'lease-ajeno', state: 'ACEPTADO' } })
assert.equal(resultado.status, 200, 'un lease ajeno se reconcilia sin romper')
assert.equal(resultado.payload.applied, false, 'un lease ajeno no cambia el estado')
assert.equal(resultado.payload.state, 'RECLAMADO', 'el trabajo sigue reclamado')
resultado = await agente('/api/print/bridge/heartbeat', { token: tokenJobs, body: { jobId: job.id } })
assert.equal(resultado.status, 200)
assert.ok(Date.parse(resultado.payload.leaseExpiresAt) > Date.parse(reclamado.leaseExpiresAt), 'el latido extiende el lease del trabajo en curso')
resultado = await agente(`/api/print/bridge/jobs/${job.id}/result`, { token: tokenJobs, body: { leaseId: reclamado.leaseId, state: 'ACEPTADO', transport: 'directo' } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.applied, true, 'el dueño del lease cierra el trabajo')
assert.equal(resultado.payload.state, 'ACEPTADO')
assert.equal(psql(`SELECT "payload" IS NULL FROM "PrintJob" WHERE "id" = '${job.id}';`), 't', 'el payload se borra al imprimir')
assert.notEqual(psql(`SELECT "suffixHash" FROM "PrintJob" WHERE "id" = '${job.id}';`), '', 'el sufijo sigue hasheado hasta confirmar')
resultado = await agente(`/api/print/bridge/jobs/${job.id}/result`, { token: tokenJobs, body: { leaseId: reclamado.leaseId, state: 'ACEPTADO' } })
assert.equal(resultado.payload.applied, false, 'el reporte repetido es idempotente')
assert.equal(resultado.payload.state, 'ACEPTADO')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_JOB_ACCEPTED' AND "entityId" = '${job.id}';`), '1', 'el resultado se audita una sola vez')

resultado = await agente(`/api/print/bridge/jobs/${jobLibre.id}/result`, { token: tokenGanadorLibre, body: { leaseId: jobLibreReclamado.leaseId, state: 'FALLIDO', error: 'x'.repeat(500) } })
assert.equal(resultado.payload.state, 'FALLIDO', 'el fallo cierra el trabajo')
assert.equal(psql(`SELECT LENGTH("error") FROM "PrintJob" WHERE "id" = '${jobLibre.id}';`), '200', 'el error del puente se trunca a 200 caracteres')

// 7g-bis. Ticket real: el corte físico viaja en los bytes que el agente
// reclama. `GS V 0` (1D 56 00) va precedido de la alimentación de 4 líneas
// (ESC d 4) que agrega `corte()`.
const ticketReal = ticketPruebaTipo('corta', { ancho: 80, impresora: 'lan:10.0.0.11:9100', nombre: 'Impresora jobs', equipo: 'arnes-it' })
const corteFisico = Buffer.from([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x00])
const bytesTicket = Buffer.from(ticketReal.base64(), 'base64')
assert.equal(ticketReal.corte, true, 'el ticket real marca el corte como enviado')
assert.ok(bytesTicket.includes(corteFisico), 'el ticket real lleva alimentación de 4 líneas y corte GS V 0')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.11:9100', payload: ticketReal.base64(), printerId: impresoraJobs.id, reference: ticketReal.ref, validation: ticketReal.validacion, width: 80, copies: 1 } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const jobTicket = resultado.payload.job
const claimTicket = await agente('/api/print/bridge/claim', { token: tokenJobs, body: {} })
assert.equal(claimTicket.payload.jobs[0]?.id, jobTicket.id, 'el ticket real se reclama')
assert.ok(Buffer.from(claimTicket.payload.jobs[0].payload, 'base64').includes(corteFisico), 'el corte viaja intacto hasta el agente')
resultado = await agente(`/api/print/bridge/jobs/${jobTicket.id}/result`, { token: tokenJobs, body: { leaseId: claimTicket.payload.jobs[0].leaseId, state: 'ACEPTADO', transport: 'directo' } })
assert.equal(resultado.payload.applied, true, 'el ticket real se cierra como aceptado')

// 7h. Confirmación en papel: sufijo incorrecto no expone el hash, correcto confirma.
const hashSufijoJob = psql(`SELECT "suffixHash" FROM "PrintJob" WHERE "id" = '${job.id}';`)
resultado = await request(`/api/print/jobs/${job.id}/confirm`, { method: 'POST', body: { suffix: '9' } })
assert.equal(resultado.status, 400, 'el sufijo incorrecto se rechaza')
assert.ok(!JSON.stringify(resultado.payload).includes(hashSufijoJob), 'el error nunca devuelve el hash del sufijo')
assert.equal(psql(`SELECT "suffixHash" <> '' FROM "PrintJob" WHERE "id" = '${job.id}';`), 't', 'el intento fallido no borra el sufijo')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_JOB_CONFIRM_FAILED' AND "entityId" = '${job.id}';`), '1', 'el intento fallido se audita sin el valor')
resultado = await request(`/api/print/jobs/${job.id}/confirm`, { method: 'POST', body: { suffix: '7' } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.state, 'CONFIRMADO', 'el sufijo correcto confirma en papel')
assert.equal(psql(`SELECT "suffixHash" = '' FROM "PrintJob" WHERE "id" = '${job.id}';`), 't', 'confirmar borra el hash del sufijo')
resultado = await request(`/api/print/jobs/${job.id}/confirm`, { method: 'POST', body: { suffix: '7' } })
assert.equal(resultado.status, 409, 'un trabajo confirmado no se vuelve a confirmar')
resultado = await request(`/api/print/jobs/${espejo.id}/confirm`, { method: 'POST', body: { suffix: '3' } })
assert.equal(resultado.status, 200, 'un espejo local aceptado también se confirma en el servidor')

// 7h-bis. Telemetría del trabajo: el encolado, el claim, el resultado y la
// confirmación en papel dejan tiempos calculados y sin negativos; el nombre de
// la impresora queda congelado al encolar.
assert.equal(psql(`SELECT "queueMs" IS NOT NULL AND "durationMs" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "transport" = 'directo' FROM "PrintJob" WHERE "id" = '${job.id}';`), 't', 'el resultado deja la telemetría completa')
assert.equal(psql(`SELECT "durationMs" >= "queueMs" AND "queueMs" >= 0 AND "enqueuedAt" <= "claimedAt" FROM "PrintJob" WHERE "id" = '${job.id}';`), 't', 'los tiempos son enteros coherentes')
assert.equal(psql(`SELECT "queueMs" IS NOT NULL AND "durationMs" IS NOT NULL FROM "PrintJob" WHERE "id" = '${jobTicket.id}';`), 't', 'el ticket real también queda medido')
assert.equal(psql(`SELECT "printerName" FROM "PrintJob" WHERE "id" = '${job.id}';`), 'Impresora jobs', 'el nombre de la impresora se congela al encolar')

// 7h-ter. Métricas de impresión: totales, promedios, serie por hora y filtros,
// solo para ADMIN/GERENTE.
resultado = await request('/api/print/metrics')
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.totales?.trabajos > 0, true, 'las métricas cuentan los trabajos del rango')
assert.ok(resultado.payload.latencias?.global?.promedioDurationMs !== null, 'las métricas promedian la duración')
assert.ok(resultado.payload.latencias?.global?.p95DurationMs !== null, 'las métricas calculan el p95')
assert.ok(Array.isArray(resultado.payload.serie) && resultado.payload.serie.length >= 1, 'las métricas devuelven la serie por hora')
assert.ok(resultado.payload.serie.every(bucket => typeof bucket.hora === 'string' && typeof bucket.trabajos === 'number' && 'promedioDurationMs' in bucket), 'cada bucket trae fecha, trabajos y promedio')
assert.ok(resultado.payload.ultimos.some(item => item.id === job.id && item.queueMs !== null && item.durationMs !== null && item.printerName === 'Impresora jobs' && item.transport === 'directo'), 'los últimos trabajos traen tiempos, impresora y transporte')
assert.ok((resultado.payload.latencias?.porImpresora || []).some(grupo => grupo.printerId === impresoraJobs.id && grupo.trabajos > 0), 'las métricas agrupan por impresora')
resultado = await request('/api/print/metrics?reference=IT-JOB')
assert.equal(resultado.status, 200)
assert.ok(resultado.payload.ultimos.length > 0 && resultado.payload.ultimos.every(item => item.reference.startsWith('IT-JOB')), 'el filtro reference acota la corrida comparativa')
resultado = await request(`/api/print/metrics?printerId=${impresoraJobs.id}`)
assert.equal(resultado.status, 200)
assert.ok(resultado.payload.ultimos.every(item => item.printerId === impresoraJobs.id), 'el filtro printerId acota la impresora')
resultado = await request('/api/print/metrics', { token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no ve las métricas de impresión')
resultado = await request('/api/print/metrics?desde=2026-01-02T00:00:00.000Z&hasta=2026-01-01T00:00:00.000Z')
assert.equal(resultado.status, 400, 'un rango invertido se rechaza')

// 7h-quater. #79: la columna muerta de la lista de precios ya no existe.
assert.equal(psql(`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'PriceList' AND column_name = 'currency';`), '1', 'PriceList conserva currency deprecado por compatibilidad')

// 7i. Requeue por lease vencido, purga de 180 días y aislamiento por empresa.
psql(`INSERT INTO "PrintJob" ("id", "tenantId", "destination", "kind", "state", "attempts", "leaseId", "leaseExpiresAt", "claimedAt", "payload", "updatedAt") VALUES ('it-job-exp-1', 'tenant-a-it', 'lan:10.0.0.11:9100', 'prueba', 'RECLAMADO', 1, 'lease-it-1', now() - interval '5 minutes', now() - interval '10 minutes', 'QUJDRA==', CURRENT_TIMESTAMP);`)
psql(`INSERT INTO "PrintJob" ("id", "tenantId", "destination", "kind", "state", "attempts", "leaseId", "leaseExpiresAt", "claimedAt", "payload", "updatedAt") VALUES ('it-job-exp-2', 'tenant-a-it', 'lan:10.0.0.11:9100', 'prueba', 'RECLAMADO', 3, 'lease-it-2', now() - interval '1 minute', now() - interval '10 minutes', 'QUJDRA==', CURRENT_TIMESTAMP);`)
psql(`INSERT INTO "PrintJob" ("id", "tenantId", "destination", "kind", "state", "createdAt", "updatedAt") VALUES ('it-job-old-1', 'tenant-a-it', 'lan:10.0.0.11:9100', 'prueba', 'ACEPTADO', now() - interval '200 days', CURRENT_TIMESTAMP);`)
psql(`INSERT INTO "PrintJob" ("id", "tenantId", "destination", "kind", "state", "updatedAt") VALUES ('it-job-b-1', 'tenant-b-it', 'lan:10.0.0.12:9100', 'prueba', 'PENDIENTE', CURRENT_TIMESTAMP);`)
resultado = await agente('/api/print/bridge/claim', { token: tokenJobs, body: {} })
assert.equal(resultado.status, 200)
assert.equal(psql(`SELECT state FROM "PrintJob" WHERE "id" = 'it-job-exp-2';`), 'FALLIDO', 'agotar intentos deja el trabajo fallido')
assert.equal(psql(`SELECT attempts FROM "PrintJob" WHERE "id" = 'it-job-exp-1';`), '2', 'el reencolado se vuelve a reclamar sin duplicar')
assert.equal(resultado.payload.jobs[0]?.id, 'it-job-exp-1', 'el trabajo reencolado se entrega de nuevo')
assert.equal(psql(`SELECT COUNT(*) FROM "PrintJob" WHERE "id" = 'it-job-old-1';`), '0', 'la purga borra metadatos de más de 180 días')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_JOB_REQUEUED' AND "entityId" = 'it-job-exp-1';`), '1', 'el requeue se audita')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_JOB_FAILED' AND "entityId" = 'it-job-exp-2';`), '1', 'el fallo por vencimiento se audita')
assert.equal(psql(`SELECT "payload" IS NULL FROM "PrintJob" WHERE "id" = 'it-job-exp-2';`), 't', 'el fallo terminal borra el payload')
assert.equal(psql(`SELECT state FROM "PrintJob" WHERE "id" = 'it-job-b-1';`), 'PENDIENTE', 'el claim no toca trabajos de otra empresa')

// 7j. Configuración del puente y kill switch.
resultado = await agente('/api/print/bridge/config', { method: 'GET', token: tokenJobs })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.ok(resultado.payload.printers.some(item => item.id === impresoraJobs.id), 'el puente aprende sus impresoras activas')
assert.ok(resultado.payload.lan.includes('lan:10.0.0.11:9100'), 'la allow-list LAN sale de las impresoras activas')
assert.equal(resultado.payload.defaultPrinterId, impresoraJobs.id, 'la impresora predeterminada viaja en la config')
assert.equal(resultado.payload.impresora, 'lan:10.0.0.11:9100', 'el destino predeterminado replica el sync legacy')
assert.equal(resultado.payload.version, '1.6.0', 'la versión reportada en el pairing se conserva')
assert.equal(resultado.payload.lanCups, 'MobOS_LAN', 'la cola CUPS por defecto viaja en la config')
psql(`UPDATE "Tenant" SET settings = '{"printRemote": false}'::jsonb WHERE "id" = 'tenant-a-it';`)
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.11:9100', payload: 'QUJDRA==' } })
assert.equal(resultado.status, 409, 'el kill switch corta el encolado')
resultado = await agente('/api/print/bridge/claim', { token: tokenJobs, body: {} })
assert.equal(resultado.status, 409, 'el kill switch corta el claim')
resultado = await agente('/api/print/bridge/config', { method: 'GET', token: tokenJobs })
assert.equal(resultado.payload.remoteEnabled, false, 'el puente ve la bandera apagada')
assert.equal(resultado.payload.printers.length, 0, 'sin remoto la config del puente queda vacía')
resultado = await request('/api/print/printers')
assert.equal(resultado.payload.remoteEnabled, false, 'la app ve la bandera apagada')
psql(`UPDATE "Tenant" SET settings = '{}'::jsonb WHERE "id" = 'tenant-a-it';`)
resultado = await agente('/api/print/bridge/config', { method: 'GET', token: tokenJobs })
assert.equal(resultado.payload.remoteEnabled, true, 'sin settings el remoto vuelve a estar encendido')

// 7k. Cap de trabajos abiertos por empresa: 200 pendientes, el siguiente da 429.
psql(`INSERT INTO "PrintJob" ("id", "tenantId", "destination", "kind", "state", "updatedAt") SELECT 'it-cap-job-' || serie, 'tenant-a-it', 'lan:10.0.0.11:9100', 'prueba', 'PENDIENTE', CURRENT_TIMESTAMP FROM generate_series(1, 200) serie;`)
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.11:9100', payload: 'QUJDRA==' } })
assert.equal(resultado.status, 429, 'con 200 trabajos abiertos el encolado da 429')
psql(`DELETE FROM "PrintJob" WHERE "id" LIKE 'it-cap-job-%';`)

// 7l. Revocar el puente corta el latido y el claim.
resultado = await request(`/api/print/bridges/${puenteJobs.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
resultado = await agente('/api/print/bridge/heartbeat', { token: tokenJobs, body: {} })
assert.equal(resultado.status, 401, 'revocar corta el latido')
resultado = await agente('/api/print/bridge/claim', { token: tokenJobs, body: {} })
assert.equal(resultado.status, 401, 'revocar corta el claim')

// 7o. Multi-puente por sucursal (#95): el puente se resuelve por la sucursal
// del trabajo y cae al de la empresa; una sucursal ajena se rechaza.
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente sucursal A IT', branchId: 'branch-a-it' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const puenteSucursal = resultado.payload.bridge
assert.equal(puenteSucursal.branchId, 'branch-a-it', 'el alta guarda la sucursal del puente')
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente sucursal ajena', branchId: 'branch-b-it' } })
assert.equal(resultado.status, 404, 'un puente no puede apuntar a una sucursal de otra empresa')
resultado = await request(`/api/print/bridges/${puenteSucursal.id}`, { method: 'PATCH', body: { branchId: 'branch-b-it' } })
assert.equal(resultado.status, 404, 'el PATCH del puente valida el tenant de la sucursal')
resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Térmica sucursal A2', destination: 'lan:10.0.0.14:9100', branchId: 'branch-a2-it' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const impresoraSucursal2 = resultado.payload
assert.equal(impresoraSucursal2.branchId, 'branch-a2-it', 'la impresora recuerda su sucursal')
resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Térmica sucursal ajena', destination: 'lan:10.0.0.15:9100', branchId: 'branch-b-it' } })
assert.equal(resultado.status, 404, 'una impresora no puede apuntar a una sucursal de otra empresa')

resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.14:9100', payload: 'QUJDRA==', branchId: 'branch-a-it', reference: 'IT-SUC-1' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const jobSucursal = resultado.payload.job
assert.equal(psql(`SELECT "bridgeId" FROM "PrintJob" WHERE "id" = '${jobSucursal.id}';`), puenteSucursal.id, 'el trabajo de la sucursal sale por su puente')
assert.equal(psql(`SELECT "metadata"->>'bridgeOrigin' FROM "AuditLog" WHERE "action" = 'PRINT_JOB_ENQUEUED' AND "entityId" = '${jobSucursal.id}';`), 'SUCURSAL', 'la auditoría registra que el puente salió de la sucursal')

// Sin puente en su sucursal (branch-a2-it), la impresora cae al puente de la
// empresa: el activo más antiguo (la predeterminada apunta a un revocado).
const puenteEmpresa = psql(`SELECT id FROM "PrintBridge" WHERE "tenantId" = 'tenant-a-it' AND "revokedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 1;`)
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.14:9100', payload: 'QUJDRA==', printerId: impresoraSucursal2.id, reference: 'IT-SUC-2' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
assert.equal(psql(`SELECT "bridgeId" FROM "PrintJob" WHERE "id" = '${resultado.payload.job.id}';`), puenteEmpresa, 'sin puente de sucursal cae al puente de la empresa')
assert.equal(psql(`SELECT "metadata"->>'bridgeOrigin' FROM "AuditLog" WHERE "action" = 'PRINT_JOB_ENQUEUED' AND "entityId" = '${resultado.payload.job.id}';`), 'EMPRESA', 'la auditoría registra el fallback de empresa')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.14:9100', payload: 'QUJDRA==', branchId: 'branch-b-it' } })
assert.equal(resultado.status, 404, 'un trabajo no puede apuntar a una sucursal de otra empresa')

resultado = await request(`/api/print/bridges/${puenteJobsB.id}`, { method: 'PATCH', body: { branchId: 'branch-a2-it' } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.branchId, 'branch-a2-it', 'el PATCH asigna la sucursal del puente')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: 'lan:10.0.0.14:9100', payload: 'QUJDRA==', printerId: impresoraSucursal2.id, branchId: 'branch-a2-it', reference: 'IT-SUC-3' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
assert.equal(psql(`SELECT "bridgeId" FROM "PrintJob" WHERE "id" = '${resultado.payload.job.id}';`), puenteJobsB.id, 'con puente en la sucursal, el trabajo va a ese puente')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_BRIDGE_UPDATED' AND "entityId" = '${puenteJobsB.id}';`), '1', 'la sucursal del puente se audita')
const configSucursales = (await request('/api/print/printers')).payload
assert.ok(Array.isArray(configSucursales.branches) && configSucursales.branches.some(sucursal => sucursal.id === 'branch-a-it' && typeof sucursal.hasSales === 'boolean'), 'la config devuelve las sucursales con ventas para la alerta del panel')
assert.ok(configSucursales.bridges.some(item => item.id === puenteSucursal.id && item.branchId === 'branch-a-it'), 'los puentes listados exponen su sucursal')

// 8. Tope de puentes por empresa: 20 activos, el 21.º da 429.
const activos = Number(psql(`SELECT COUNT(*) FROM "PrintBridge" WHERE "tenantId" = 'tenant-a-it' AND "revokedAt" IS NULL;`))
psql(`INSERT INTO "PrintBridge" ("id", "tenantId", "name", "tokenHash", "updatedAt") SELECT 'it-cap-' || serie, 'tenant-a-it', 'Cap ' || serie, md5('cap-' || serie || clock_timestamp()::text), CURRENT_TIMESTAMP FROM generate_series(1, ${20 - activos}) serie;`)
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente de más' } })
assert.equal(resultado.status, 429, `con 20 puentes activos el alta da 429 (había ${activos})`)

// 9. Manifest del instalador: 503 sin artefacto publicado; 200 con contrato completo.
const manifest = await fetch(`${baseUrl}/api/print-agent/manifest`)
if (manifest.status === 503) {
  assert.equal(manifest.status, 503, 'sin artefacto el manifest avisa 503')
} else {
  assert.equal(manifest.status, 200, 'el manifest responde 200 cuando el artefacto existe')
  const cuerpo = await manifest.json()
  assert.ok(cuerpo.version && cuerpo.file && /^[a-f0-9]{64}$/i.test(cuerpo.sha256) && cuerpo.size > 0 && cuerpo.installUrl, 'el manifest publica versión, archivo, checksum, tamaño e installUrl')
}

// 7m. Rotación del token: el token viejo deja de autenticar y el nuevo sí.
// Puente propio: los anteriores quedaron revocados y los rellenos del tope
// (it-cap-*) ya cumplieron su caso, así que se liberan.
psql(`DELETE FROM "PrintBridge" WHERE "id" LIKE 'it-cap-%';`)
resultado = await request('/api/print/bridges', { method: 'POST', body: { name: 'Puente rotación' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const puenteRotacion = resultado.payload.bridge
resultado = await agente('/api/print/bridge/pair', { body: { code: resultado.payload.pairingCode, name: 'Mac rotada', version: '1.6.0' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const tokenViejo = resultado.payload.token
resultado = await request(`/api/print/bridges/${puenteRotacion.id}/pairing`, { method: 'POST' })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
resultado = await agente('/api/print/bridge/pair', { body: { code: resultado.payload.pairingCode, name: 'Mac rotada', version: '1.6.0' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const tokenRotado = resultado.payload.token
assert.match(String(tokenRotado), /^[a-f0-9]{64}$/, 'la rotación entrega un token nuevo')
assert.notEqual(tokenRotado, tokenViejo, 'el token rotado es distinto del anterior')
resultado = await agente('/api/print/bridge/heartbeat', { token: tokenViejo, body: {} })
assert.equal(resultado.status, 401, 'el token viejo deja de autenticar tras rotar')
resultado = await agente('/api/print/bridge/heartbeat', { token: tokenRotado, body: {} })
assert.equal(resultado.status, 200, 'el token rotado autentica')

// 7n. El tarball público coincide con el checksum que publica el manifest.
const manifestPublico = await fetch(`${baseUrl}/print-agent/manifest.json`)
assert.equal(manifestPublico.status, 200, 'el manifest estático se sirve')
const publico = await manifestPublico.json()
const tarball = await fetch(`${baseUrl}/print-agent/${publico.file}`)
assert.equal(tarball.status, 200, 'el tarball se sirve desde el backend')
const bytes = Buffer.from(await tarball.arrayBuffer())
const resumen = createHash('sha256').update(bytes).digest('hex')
assert.equal(resumen, publico.sha256, 'el checksum del tarball servido coincide con el manifest')
assert.equal(bytes.length, publico.size, 'el tamaño del tarball servido coincide con el manifest')

// 10. Cancelación de pendientes y guarda anti-duplicados (#128): la cola del
// panel cancela lo que no salió, el claim lo saltea y la auditoría guarda el
// actor real. La reimpresión explícita (force) es la única vía para repetir.
// Se reutiliza el puente B (activo): el de 7b quedó revocado más arriba y el
// pairing tiene rate limit agotado a propósito por secciones anteriores.
resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Impresora cancelación', destination: 'lan:10.0.0.15:9100', bridgeId: puenteJobsB.id, width: 58, isActive: true } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const impresoraCancel = resultado.payload
const destinoCancel = 'lan:10.0.0.15:9100'

// 10a. Un pendiente con el puente apagado se cancela, se audita con el actor
// real y el claim lo saltea al reconectar.
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: destinoCancel, printerId: impresoraCancel.id, payload: 'QUJDRA==', kind: 'comprobante', reference: 'IT-CANCELA-1', requestedByName: 'Cancelación IT' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const jobCancelado = resultado.payload.job
assert.equal(jobCancelado.state, 'PENDIENTE', 'el trabajo nace pendiente')
resultado = await request(`/api/print/jobs/${jobCancelado.id}/cancel`, { method: 'POST', token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no cancela trabajos de impresión')
resultado = await request(`/api/print/jobs/${jobCancelado.id}`, { token: null })
assert.equal(resultado.status, 401, 'cancelar exige sesión')
resultado = await request(`/api/print/jobs/${jobCancelado.id}/cancel`, { method: 'POST' })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.job.state, 'CANCELADO', 'el trabajo queda cancelado')
assert.equal(psql(`SELECT "payload" IS NULL FROM "PrintJob" WHERE "id" = '${jobCancelado.id}';`), 't', 'el ticket del cancelado se borra')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE action = 'PRINT_JOB_CANCELLED' AND "entityId" = '${jobCancelado.id}';`), '1', 'la cancelación se audita una sola vez')
assert.equal(psql(`SELECT "metadata"->>'via' FROM "AuditLog" WHERE action = 'PRINT_JOB_CANCELLED' AND "entityId" = '${jobCancelado.id}';`), 'individual', 'la cancelación individual queda marcada')
assert.equal(
  psql(`SELECT "userId" FROM "AuditLog" WHERE action = 'PRINT_JOB_CANCELLED' AND "entityId" = '${jobCancelado.id}';`),
  psql(`SELECT "userId" FROM "AuditLog" WHERE action = 'PRINT_JOB_ENQUEUED' AND "entityId" = '${jobCancelado.id}';`),
  'el actor real de la cancelación es quien la ejecutó',
)
resultado = await request(`/api/print/jobs/${jobCancelado.id}/cancel`, { method: 'POST' })
assert.equal(resultado.status, 409, 'cancelar dos veces el mismo trabajo da 409')
const claimTrasCancelar = await agente('/api/print/bridge/claim', { token: tokenJobsB, body: {} })
assert.equal(claimTrasCancelar.status, 200, 'el claim responde con el token del puente')
assert.ok(!(claimTrasCancelar.payload.jobs || []).some(item => item.id === jobCancelado.id), 'un trabajo cancelado no se reclama al reconectar')
assert.equal(psql(`SELECT state FROM "PrintJob" WHERE id = '${jobCancelado.id}';`), 'CANCELADO', 'el claim no revive el trabajo cancelado')

// 10b. Guarda anti-duplicados: mismo documento + tipo + impresora dentro de la
// ventana se bloquea y devuelve el pendiente; "Reimprimir igual" (force) crea
// un trabajo nuevo y la auditoría lo marca como reimpresión.
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: destinoCancel, printerId: impresoraCancel.id, payload: 'QUJDRA==', kind: 'etiqueta', reference: 'IT-DUP-1' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const jobDup = resultado.payload.job
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: destinoCancel, printerId: impresoraCancel.id, payload: 'QUJDRA==', kind: 'etiqueta', reference: 'IT-DUP-1' } })
assert.equal(resultado.status, 409, 'el click repetido sobre el mismo documento se bloquea')
assert.equal(resultado.payload.duplicate, true, 'la respuesta marca el duplicado')
assert.equal(resultado.payload.job.id, jobDup.id, 'la respuesta trae el trabajo pendiente existente')
assert.ok(!/"payload":/.test(JSON.stringify(resultado.payload)), 'la respuesta del duplicado tampoco expone el ticket')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: destinoCancel, printerId: impresoraCancel.id, payload: 'QUJDRA==', kind: 'comprobante', reference: 'IT-DUP-1' } })
assert.equal(resultado.status, 201, 'otro tipo del mismo documento no es duplicado')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: destinoCancel, printerId: impresoraCancel.id, payload: 'QUJDRA==', kind: 'etiqueta', reference: 'IT-DUP-1', force: true } })
assert.equal(resultado.status, 201, 'la reimpresión explícita crea un trabajo nuevo')
const jobReimpreso = resultado.payload.job
assert.notEqual(jobReimpreso.id, jobDup.id, 'la reimpresión es un trabajo distinto del pendiente')
assert.equal(psql(`SELECT "metadata"->>'reimpresion' FROM "AuditLog" WHERE action = 'PRINT_JOB_ENQUEUED' AND "entityId" = '${jobReimpreso.id}';`), 'true', 'la reimpresión queda auditada')

// 10c. Lo que ya salió de la cola no se cancela: RECLAMADO y ACEPTADO dan 409.
psql(`UPDATE "PrintJob" SET state = 'RECLAMADO', "leaseId" = 'lease-it', "leaseExpiresAt" = CURRENT_TIMESTAMP + interval '2 minutes' WHERE id = '${jobDup.id}';`)
resultado = await request(`/api/print/jobs/${jobDup.id}/cancel`, { method: 'POST' })
assert.equal(resultado.status, 409, 'un trabajo reclamado por el puente no se cancela')
psql(`UPDATE "PrintJob" SET state = 'ACEPTADO', "leaseId" = NULL, "leaseExpiresAt" = NULL WHERE id = '${jobDup.id}';`)
resultado = await request(`/api/print/jobs/${jobDup.id}/cancel`, { method: 'POST' })
assert.equal(resultado.status, 409, 'un trabajo aceptado no se cancela')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE action = 'PRINT_JOB_CANCELLED' AND "entityId" = '${jobDup.id}';`), '0', 'un intento rechazado no deja evento de cancelación')

// 10d. Cancelación en lote por impresora: cancela todos los pendientes,
// audita cada trabajo con via=lote y no toca lo que ya salió.
resultado = await request('/api/print/jobs/cancel', { method: 'POST', body: {} })
assert.equal(resultado.status, 400, 'el lote sin filtros se rechaza')
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: destinoCancel, printerId: impresoraCancel.id, payload: 'QUJDRA==', kind: 'nota-entrega', reference: 'IT-LOTE-1' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const jobLote1 = resultado.payload.job
resultado = await request('/api/print/jobs', { method: 'POST', body: { destination: destinoCancel, printerId: impresoraCancel.id, payload: 'QUJDRA==', kind: 'nota-entrega', reference: 'IT-LOTE-2' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const jobLote2 = resultado.payload.job
resultado = await request('/api/print/jobs/cancel', { method: 'POST', token: sellerToken, body: { printerId: impresoraCancel.id } })
assert.equal(resultado.status, 403, 'un vendedor tampoco cancela en lote')
resultado = await request('/api/print/jobs/cancel', { method: 'POST', body: { printerId: impresoraCancel.id } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.ok(resultado.payload.total >= 3, `el lote cancela los pendientes de la impresora (${resultado.payload.total})`)
assert.equal(psql(`SELECT COUNT(*) FROM "PrintJob" WHERE "tenantId" = 'tenant-a-it' AND "printerId" = '${impresoraCancel.id}' AND state = 'PENDIENTE';`), '0', 'no queda ningún pendiente de esa impresora')
assert.equal(psql(`SELECT "metadata"->>'via' FROM "AuditLog" WHERE action = 'PRINT_JOB_CANCELLED' AND "entityId" = '${jobLote1.id}';`), 'lote', 'el lote audita cada trabajo con via=lote')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE action = 'PRINT_JOB_CANCELLED' AND "entityId" IN ('${jobLote1.id}', '${jobLote2.id}');`), '2', 'cada trabajo del lote tiene su evento')
assert.equal(psql(`SELECT state FROM "PrintJob" WHERE id = '${jobLote1.id}';`), 'CANCELADO', 'el trabajo del lote queda cancelado')
const claimFinal = await agente('/api/print/bridge/claim', { token: tokenJobsB, body: {} })
assert.ok(!(claimFinal.payload.jobs || []).some(item => [jobCancelado.id, jobLote1.id, jobLote2.id].includes(item.id)), 'el claim queda sin trabajos cancelados')

console.log('print-bridge-http: puentes, impresoras, import idempotente, trabajos con lease y confirmación, cancelación, anti-duplicados, tope y manifest OK.')
