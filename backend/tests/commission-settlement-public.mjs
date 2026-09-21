// #172/#178 - Comprobante público de comisiones: el token solo vive hasheado
// (sha256), la emisión/rotación lo revela una vez, el endpoint público tiene
// límite de uso y la migración hashea los tokens legacy (el QR viejo sigue
// validando). Prueba las rutas reales contra un PostgreSQL descartable.
//
// Uso: PG_BIN=/opt/homebrew/bin node backend/tests/commission-settlement-public.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
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
const root = mkdtempSync(join(tmpdir(), 'mobos-settlement-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/settlement_test`
const migrationDir = join(backend, 'prisma/migrations/20261111000000_commission_settlement_token_hash')
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
let started = false, prisma, checks = 0
const ok = (condition, label) => { assert.ok(condition, label); checks++ }
const diaLocal = (fecha = new Date()) => new Date(fecha.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)

try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'settlement_test'])
  for (const e of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', e.name, 'migration.sql')))
  }
  Object.assign(process.env, {
    DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_APP_URL: 'https://app.example.test',
    MOBOS_AUTH_SECRET: 'cd'.repeat(32), MOBOS_TRUST_PROXY: 'true',
  })
  require.extensions['.ts'] = (m, p) => m._compile(ts.transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, p)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { hashToken } = require('../lib/auth.ts')
  const { resetRateLimitsForTests } = require('../lib/rate-limit.ts')
  const { POST: crearLiquidacion } = require('../app/api/commission-settlements/route.ts')
  const { PATCH: mutarLiquidacion } = require('../app/api/commission-settlements/[id]/route.ts')
  const { GET: verComprobante } = require('../app/api/public/commission-settlements/[token]/route.ts')

  const tenant = await prisma.tenant.create({ data: { name: 'Tienda Comisiones', slug: 'tienda-comisiones', email: 'comisiones@example.test' } })
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Central' } })
  const vendedor = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Vendedor Comisiones', pinHash: 'sin-uso', role: 'VENDEDOR', branchId: branch.id } })
  const admin = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dueño Comisiones', pinHash: 'sin-uso', role: 'ADMIN', branchId: branch.id } })
  const otroTenant = await prisma.tenant.create({ data: { name: 'Otra Tienda', slug: 'otra-tienda-settlement', email: 'otra-settlement@example.test' } })
  const otroVendedor = await prisma.user.create({ data: { tenantId: otroTenant.id, name: 'Ajeno', pinHash: 'sin-uso', role: 'VENDEDOR' } })
  const otroAdmin = await prisma.user.create({ data: { tenantId: otroTenant.id, name: 'Dueño Ajeno', pinHash: 'sin-uso', role: 'ADMIN' } })

  const sesionDe = async (usuario) => {
    const token = randomBytes(32).toString('hex')
    await prisma.session.create({ data: { tenantId: usuario.tenantId, userId: usuario.id, level: 'SELLER', deviceId: 'test-178', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } })
    return `mobos_seller_session=${token}`
  }
  const cookieAdmin = await sesionDe(admin)
  const cookieVendedor = await sesionDe(vendedor)
  const cookieOtro = await sesionDe(otroAdmin)

  const order = await prisma.order.create({
    data: { tenantId: tenant.id, branchId: branch.id, sellerId: vendedor.id, orderNumber: 'TST-178-0001', status: 'COMPLETED', subtotalPyg: 1000000, totalPyg: 1000000 },
  })
  await prisma.orderItem.create({ data: { orderId: order.id, description: 'Producto de prueba', quantity: 1, unitPricePyg: 1000000, totalPyg: 1000000, unitCostPyg: 600000 } })
  await prisma.commissionRule.create({ data: { tenantId: tenant.id, userId: vendedor.id, percentPyg: 10 } })

  const hoy = diaLocal()
  const peticion = (cookie, method = 'GET', body, extra = {}) => new Request('https://api.example.test/api/commission-settlements', {
    method,
    headers: { origin: 'https://app.example.test', 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  // ── Emisión: token de 64 hex que se revela una vez y solo vive hasheado ──
  const creada = await crearLiquidacion(peticion(cookieAdmin, 'POST', { sellerId: vendedor.id, from: hoy, to: hoy }))
  const liquidacion = await creada.json()
  ok(creada.status === 201, 'la liquidación se crea con el período del vendedor')
  ok(/^[a-f0-9]{64}$/.test(liquidacion.verificationToken || ''), 'la emisión revela un token de 64 hex')
  ok(liquidacion.hasVerificationToken === true && Boolean(liquidacion.verificationTokenIssuedAt), 'la vista informa que hay enlace emitido y cuándo')
  const guardada = await prisma.commissionSettlement.findUnique({ where: { id: liquidacion.id }, select: { verificationToken: true, verificationTokenHash: true } })
  ok(guardada.verificationToken === null, 'el token crudo no se guarda en la base')
  ok(guardada.verificationTokenHash === hashToken(liquidacion.verificationToken), 'se guarda el sha256 del token')

  // ── Verificación pública: mínima, sin datos internos, con límite de uso ──
  const ver = token => verComprobante(new Request(`https://api.example.test/api/public/commission-settlements/${encodeURIComponent(token)}`), { params: Promise.resolve({ token }) })
  const publica = await ver(liquidacion.verificationToken)
  const comprobante = await publica.json()
  ok(publica.status === 200 && comprobante.verificado === true && comprobante.sellerName === vendedor.name, 'el QR verifica el comprobante sin sesión')
  ok(comprobante.totalPyg === 40000, 'el comprobante muestra el total liquidado')
  const serializado = JSON.stringify(comprobante)
  ok(!serializado.includes('lines') && !serializado.includes('margin') && !serializado.includes('Hash'), 'no expone detalle, margen ni hash')
  ok((await ver('f'.repeat(64))).status === 404, 'un token inexistente responde 404')
  ok((await ver('no-es-un-token')).status === 404, 'un token con formato inválido responde 404')

  resetRateLimitsForTests()
  const ip = { 'x-forwarded-for': '203.0.113.77' }
  const peticionPublica = () => verComprobante(new Request(`https://api.example.test/api/public/commission-settlements/${liquidacion.verificationToken}`, { headers: ip }), { params: Promise.resolve({ token: liquidacion.verificationToken }) })
  for (let i = 0; i < 30; i++) ok((await peticionPublica()).status === 200, `intento ${i + 1} dentro del límite`)
  const bloqueada = await peticionPublica()
  ok(bloqueada.status === 429 && Number(bloqueada.headers.get('Retry-After')) >= 1, 'el intento 31 responde 429 con Retry-After')
  resetRateLimitsForTests()

  // ── Rotación: enlace nuevo, el anterior deja de validar y queda auditado ──
  const rotada = await mutarLiquidacion(peticion(cookieAdmin, 'PATCH', { action: 'rotate' }), { params: Promise.resolve({ id: liquidacion.id }) })
  const conToken = await rotada.json()
  ok(rotada.status === 200 && /^[a-f0-9]{64}$/.test(conToken.verificationToken || ''), 'rotar emite un token nuevo de 64 hex')
  ok(conToken.verificationToken !== liquidacion.verificationToken, 'el token rotado es distinto')
  ok((await ver(liquidacion.verificationToken)).status === 404, 'el QR anterior deja de validar al rotar')
  ok((await ver(conToken.verificationToken)).status === 200, 'el QR nuevo valida')
  const hashRotado = await prisma.commissionSettlement.findUnique({ where: { id: liquidacion.id }, select: { verificationTokenHash: true, verificationToken: true } })
  ok(hashRotado.verificationTokenHash === hashToken(conToken.verificationToken) && hashRotado.verificationToken === null, 'la rotación solo persiste el hash')
  const auditoria = await prisma.auditLog.findFirst({ where: { action: 'COMMISSION_SETTLEMENT_TOKEN_ROTATED', entityId: liquidacion.id } })
  ok(Boolean(auditoria) && auditoria.userId === admin.id, 'la rotación queda auditada con el actor real')

  // ── Permisos y aislamiento ──
  const sinPermiso = await mutarLiquidacion(peticion(cookieVendedor, 'PATCH', { action: 'rotate' }), { params: Promise.resolve({ id: liquidacion.id }) })
  ok(sinPermiso.status === 403, 'un vendedor sin permisos no rota el enlace')
  const ajeno = await mutarLiquidacion(peticion(cookieOtro, 'PATCH', { action: 'rotate' }), { params: Promise.resolve({ id: liquidacion.id }) })
  ok(ajeno.status === 404, 'no se rota la liquidación de otra tienda')

  // ── Backfill legacy: el token viejo (cuid) sigue validando por hash ──
  const legacy = await prisma.commissionSettlement.create({
    data: { tenantId: otroTenant.id, sellerId: otroVendedor.id, periodFrom: hoy, periodTo: hoy, totalPyg: 1000, createdById: otroAdmin.id, verificationToken: 'legacy-cuid-token-178' },
  })
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(migrationDir, 'migration.sql')))
  const migrada = await prisma.commissionSettlement.findUnique({ where: { id: legacy.id }, select: { verificationToken: true, verificationTokenHash: true, verificationTokenIssuedAt: true } })
  ok(migrada.verificationToken === null && migrada.verificationTokenHash === hashToken('legacy-cuid-token-178'), 'la migración hashea el token legacy y vacía el crudo')
  ok(Boolean(migrada.verificationTokenIssuedAt), 'la migración deja la fecha de emisión del enlace legacy')
  ok((await ver('legacy-cuid-token-178')).status === 200, 'el QR legacy sigue validando por hash')

  console.log(`Comprobante de comisiones: ${checks} checks OK`)
} finally {
  if (started) { try { run('pg_ctl', ['-D', pgdata, 'stop', '-w', '-m', 'immediate']) } catch { /* ya estaba detenido */ } }
  rmSync(root, { recursive: true, force: true })
}
