import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const backend = dirname(dirname(fileURLToPath(import.meta.url)))
const ts = require('typescript')
const pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const port = await new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-public403-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/public403_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
let started = false, prisma, checks = 0
const ok = (value, label) => { assert.ok(value, label); checks++ }
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'public403_test'])
  for (const entry of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', entry.name, 'migration.sql')))
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_APP_URL: 'https://app.example.test', MOBOS_AUTH_SECRET: 'cd'.repeat(32) })
  require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, path)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { GET: getRemito, POST: receiveRemito } = require('../app/api/transfers/public/[token]/route.ts')
  const tenant = await prisma.tenant.create({ data: { name: 'Tienda QA A', slug: 'qa403-a', email: 'a@example.test', phone: '0981999001' } })
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Sucursal QA A', phone: '0981555001' } })
  const destination = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Destino QA A' } })
  const user = await prisma.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'Empleado QA', pinHash: 'sin-uso', role: 'ADMIN' } })
  const privateNote = 'NOTA-INTERNA-CANARIO-403'
  const privateReceived = 'RECEPCION-INTERNA-CANARIO-403'
  const transfer = await prisma.stockTransfer.create({ data: { tenantId: tenant.id, sourceBranchId: branch.id, destinationBranchId: destination.id, createdById: user.id, notes: privateNote, receivedNote: privateReceived } })
  const get = (handler, token) => handler(new Request(`https://api.example.test/public/${token}`), { params: Promise.resolve({ token }) })
  const response = await get(getRemito, transfer.publicToken)
  const remito = await response.json()
  ok(response.status === 200, 'remito anónimo abre con token válido')
  console.log('Canarios sintéticos persistidos en Remito; exposición notes/receivedNote:', JSON.stringify(remito).includes(privateNote), JSON.stringify(remito).includes(privateReceived))
  ok(!JSON.stringify(remito).includes(privateNote), 'nota interna del traslado no llega al DTO público')
  ok(!JSON.stringify(remito).includes(privateReceived), 'nota interna de recepción no llega al DTO público')
  ok(!('notes' in remito) && !('receivedNote' in remito), 'DTO ni siquiera ofrece campos de notas internas')
  const stored = await prisma.stockTransfer.findUnique({ where: { id: transfer.id } })
  ok(stored.notes === privateNote && stored.receivedNote === privateReceived, 'GET no borra ni altera notas internas persistidas')
  ok((await get(getRemito, 'inexistente')).status === 404, 'un token distinto no permite leer traslado')
  const received = await receiveRemito(new Request('https://api.example.test/public/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'receive', note: 'Recepción QA propia', serialsOk: [] }) }), { params: Promise.resolve({ token: transfer.publicToken }) })
  ok(received.status === 200, 'recepción pública sigue funcionando')
  const after = await prisma.stockTransfer.findUnique({ where: { id: transfer.id } })
  ok(after.notes === privateNote && after.receivedNote === 'Recepción QA propia' && after.receivedAt, 'recepción conserva observaciones internas y guarda nota propia como antes')
  ok(await prisma.auditLog.count({ where: { entityId: transfer.id, action: 'STOCK_TRANSFER_RECEIVED' } }) === 1, 'recepción mantiene auditoría única')
  const dtoAfter = await (await get(getRemito, transfer.publicToken)).json()
  ok(dtoAfter.status === 'RECEIVED' && !('notes' in dtoAfter) && !('receivedNote' in dtoAfter), 'reabrir confirma recepción sin exponer notas persistidas')
  const repeated = await receiveRemito(new Request('https://api.example.test/public/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'receive' }) }), { params: Promise.resolve({ token: transfer.publicToken }) })
  ok(repeated.status === 409, 'recepción repetida conserva idempotencia/conflicto')
  console.log(`Públicas403/503: ${checks} checks OK`)
} finally {
  if (prisma) await prisma.$disconnect()
  if (started) { try { run('pg_ctl', ['-D', pgdata, 'stop', '-w', '-m', 'immediate']) } catch { /* ya detenido */ } }
  rmSync(root, { recursive: true, force: true })
}
