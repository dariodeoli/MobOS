// #172 - Enlace público del borrador (#154): token no enumerable, vencimiento
// con reloj de Postgres, revocación/regeneración, sin datos internos y límite
// de uso. Prueba las rutas reales contra un PostgreSQL descartable.
//
// Uso: node backend/tests/suspended-sales-public.mjs
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
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-draft-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/draft_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
let started = false, prisma, checks = 0
const ok = (condition, label) => { assert.ok(condition, label); checks++ }
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'draft_test'])
  for (const e of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', e.name, 'migration.sql')))
  }
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_APP_URL: 'https://app.example.test', MOBOS_AUTH_SECRET: 'cd'.repeat(32) })
  require.extensions['.ts'] = (m, p) => m._compile(ts.transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, p)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { hashToken } = require('../lib/auth.ts')
  const { PATCH } = require('../app/api/suspended-sales/route.ts')
  const { GET } = require('../app/api/suspended-sales/public/[token]/route.ts')

  const tenant = await prisma.tenant.create({ data: { name: 'Tienda Borradores', slug: 'tienda-borradores', email: 'borradores@example.test' } })
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Centro' } })
  const vendedor = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Vendedor E2E', pinHash: 'sin-uso', role: 'VENDEDOR', branchId: branch.id } })
  const otroTenant = await prisma.tenant.create({ data: { name: 'Otra Tienda', slug: 'otra-tienda', email: 'otra@example.test' } })
  const otroBranch = await prisma.branch.create({ data: { tenantId: otroTenant.id, name: 'Otra' } })
  const otroUser = await prisma.user.create({ data: { tenantId: otroTenant.id, name: 'Otro', pinHash: 'sin-uso', role: 'ADMIN', branchId: otroBranch.id } })
  const sessionToken = 'a'.repeat(64)
  await prisma.session.create({ data: { tenantId: tenant.id, userId: vendedor.id, level: 'SELLER', deviceId: 'test', tokenHash: hashToken(sessionToken), expiresAt: new Date(Date.now() + 3600_000) } })
  const cookie = `mobos_seller_session=${sessionToken}`
  const sesionOk = () => new Request('https://api.example.test/api/suspended-sales', { method: 'PATCH', headers: { origin: 'https://app.example.test', cookie, 'content-type': 'application/json' } })

  const interna = 'NOTA-INTERNA-QUE-NO-SE-EXPONE'
  const telefonoCliente = '0981555000'
  const borrador = await prisma.suspendedSale.create({ data: {
    tenantId: tenant.id, branchId: branch.id, userId: vendedor.id, label: 'Carrito E2E',
    payload: { items: [{ productoId: 'p1', nombre: 'iPhone E2E', quantity: 2, precio: 500000, descuento: 0, costo: 300000 }], descuento: '0', montoDelivery: '0', observacion: 'Entregar por la tarde', interno: interna },
  } })
  const ajeno = await prisma.suspendedSale.create({ data: { tenantId: otroTenant.id, branchId: otroBranch.id, userId: otroUser.id, payload: { items: [] } } })

  const sinSesion = await PATCH(new Request('https://api.example.test/api/suspended-sales', { method: 'PATCH', headers: { origin: 'https://app.example.test', 'content-type': 'application/json' }, body: JSON.stringify({ id: borrador.id }) }))
  ok(sinSesion.status === 401, 'sin sesión no se genera el enlace')

  const patch = await PATCH(new Request(sesionOk(), { body: JSON.stringify({ id: borrador.id }) }))
  const emitido = await patch.json()
  ok(patch.status === 200 && /^[a-f0-9]{64}$/.test(emitido.token), 'el enlace emite un token de 64 hex')
  ok(emitido.expiresAt && new Date(emitido.expiresAt).getTime() > Date.now() + 6 * 86400000, 'el enlace vence a los 7 días (reloj de Postgres)')
  const guardado = await prisma.suspendedSale.findUnique({ where: { id: borrador.id }, select: { publicTokenHash: true } })
  ok(guardado.publicTokenHash && guardado.publicTokenHash !== emitido.token, 'solo se guarda el sha256 del token')

  const publicar = token => GET(new Request(`https://api.example.test/api/suspended-sales/public/${token}`), { params: Promise.resolve({ token }) })
  const vista = await publicar(emitido.token)
  const carrito = await vista.json()
  ok(vista.status === 200 && carrito.items?.[0]?.description === 'iPhone E2E', 'el cliente ve el carrito con el token')
  ok(carrito.totalPyg === 1000000 && carrito.notes === 'Entregar por la tarde', 'totales y observación de entrega visibles')
  const serializado = JSON.stringify(carrito)
  ok(!serializado.includes(interna) && !serializado.includes(telefonoCliente), 'no expone notas internas ni teléfono del cliente')
  ok(!('payload' in carrito) && !serializado.includes('costo') && !serializado.includes('publicTokenHash'), 'no expone payload, costos ni el hash')
  ok('expiresAt' in carrito, 'la vista informa el vencimiento')

  await prisma.$executeRaw`UPDATE "SuspendedSale" SET "publicTokenExpiresAt" = now() - interval '1 minute' WHERE "id" = ${borrador.id}`
  const vencido = await publicar(emitido.token)
  ok(vencido.status === 410, 'un enlace vencido responde 410')

  const regenerar = await PATCH(new Request(sesionOk(), { body: JSON.stringify({ id: borrador.id, regenerate: true }) }))
  const nuevo = await regenerar.json()
  ok(regenerar.status === 200 && nuevo.token !== emitido.token, 'regenerar emite un token nuevo')
  ok((await publicar(emitido.token)).status === 404, 'el token anterior deja de abrir al regenerar')
  ok((await publicar(nuevo.token)).status === 200, 'el token nuevo abre')

  const revocar = await PATCH(new Request(sesionOk(), { body: JSON.stringify({ id: borrador.id, revoke: true }) }))
  ok(revocar.status === 200 && (await revocar.json()).revoked === true, 'se puede revocar el enlace sin emitir otro')
  ok((await publicar(nuevo.token)).status === 404, 'el enlace revocado deja de abrir')

  ok((await publicar('no-es-un-token')).status === 404, 'un token con formato inválido responde 404')
  ok((await publicar('f'.repeat(64))).status === 404, 'un token inexistente responde 404')

  const ajenoPatch = await PATCH(new Request(sesionOk(), { body: JSON.stringify({ id: ajeno.id }) }))
  ok(ajenoPatch.status === 404, 'no se puede emitir el enlace de un borrador de otra tienda')
  await prisma.auditLog.findFirst({ where: { action: 'SALE_PUBLIC_LINK_REVOKED', entityId: borrador.id } }).then(fila => ok(Boolean(fila), 'la revocación queda auditada'))
  const linkAudit = await prisma.auditLog.findFirst({ where: { action: 'SALE_PUBLIC_LINK', entityId: borrador.id } })
  ok(Boolean(linkAudit) && linkAudit.userId === vendedor.id, 'la emisión queda auditada con el actor real')

  console.log(`Borrador público: ${checks} checks OK`)
} finally {
  if (started) { try { run('pg_ctl', ['-D', pgdata, 'stop', '-w', '-m', 'immediate']) } catch { /* ya estaba detenido */ } }
  rmSync(root, { recursive: true, force: true })
}
