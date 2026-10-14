// Prueba contra una base real (no corre en run-unit): SUPERADMIN_DB_TEST=1 y
// DATABASE_URL de una base con todas las migraciones aplicadas.
//   SUPERADMIN_DB_TEST=1 DATABASE_URL=... node backend/tests/run-superadmin-db.cjs
import assert from 'node:assert/strict'
import test from 'node:test'

const activo = process.env.SUPERADMIN_DB_TEST === '1'
const DUENO = 'dueno-plataforma@ejemplo.test'

test('acceso con cuenta de Google creada de verdad: solo pasa quien prueba el correo por Google', { skip: !activo }, async () => {
  const { prisma } = require('../lib/prisma.ts')
  const { googleCompany } = require('../lib/google-company.ts')
  const { evaluarAccesoPlataforma } = require('../lib/superadmin/acceso.ts')
  const sufijo = Date.now().toString(36)

  // 1) El dueño entra con Google: se crea la empresa, el perfil y la cuenta reales.
  const identidad = { sub: `g-${sufijo}-dueno`, email: DUENO, name: 'Dueño', picture: '' }
  const alta = await googleCompany(identidad, { action: 'create', companyName: `Plataforma ${sufijo}` })
  const tenantId = alta.tenant.id
  const usuario = await prisma.user.findFirst({ where: { tenantId, role: 'ADMIN' } })
  const cuenta = await prisma.account.findUnique({ where: { googleSubject: identidad.sub } })
  assert.ok(usuario && cuenta, 'se crearon el perfil y la cuenta')
  assert.equal((await prisma.googleIdentity.findUnique({ where: { subject: identidad.sub } })).email, DUENO, 'la identidad guarda el correo verificado por Google')
  assert.equal((await evaluarAccesoPlataforma({ userId: usuario.id, accountId: cuenta.id }, DUENO)).motivo, null, 'el dueño pasa')
  assert.equal((await evaluarAccesoPlataforma({ userId: usuario.id, accountId: cuenta.id }, 'otro@ejemplo.test')).motivo, 'correo_distinto')
  assert.equal((await evaluarAccesoPlataforma({ userId: usuario.id, accountId: null }, DUENO)).motivo, 'sin_cuenta_google')

  // 2) Otra persona con Google y otro correo, aunque su empresa y perfil digan que son del dueño.
  const otra = await googleCompany({ sub: `g-${sufijo}-otra`, email: `otra-${sufijo}@ejemplo.test`, name: 'Otra', picture: '' }, { action: 'create', companyName: `Otra ${sufijo}` })
  const usuarioOtra = await prisma.user.findFirst({ where: { tenantId: otra.tenant.id, role: 'ADMIN' } })
  const cuentaOtra = await prisma.account.findUnique({ where: { googleSubject: `g-${sufijo}-otra` } })
  await prisma.tenant.update({ where: { id: otra.tenant.id }, data: { email: DUENO.replace('dueno', `x${sufijo}`) } })
  await prisma.tenant.update({ where: { id: otra.tenant.id }, data: { emailVerifiedAt: new Date() } })
  await prisma.user.update({ where: { id: usuarioOtra.id }, data: { email: DUENO } })
  assert.equal((await evaluarAccesoPlataforma({ userId: usuarioOtra.id, accountId: cuentaOtra.id }, DUENO)).motivo, 'correo_distinto', 'editar el perfil o el correo de la empresa no da acceso')

  // 3) Empresa con correo del dueño verificado pero sin Google: no pasa.
  const sinGoogle = await prisma.tenant.create({ data: { name: `Sin Google ${sufijo}`, slug: `sg-${sufijo}`, email: DUENO.replace('dueno', `sg${sufijo}`), emailVerifiedAt: new Date() } })
  const perfil = await prisma.user.create({ data: { tenantId: sinGoogle.id, name: 'X', email: DUENO, pinHash: 'h', role: 'ADMIN' } })
  assert.equal((await evaluarAccesoPlataforma({ userId: perfil.id, accountId: null }, DUENO)).motivo, 'sin_cuenta_google')
  await prisma.$disconnect()
})

test('tráfico y demo: el endpoint guarda eventos válidos y la agregación los cuenta (demo aparte, sin PII)', { skip: !activo }, async () => {
  const { prisma } = require('../lib/prisma.ts')
  const { POST } = require('../app/api/public/track/route.ts')
  const { traficoYDemo } = require('../lib/superadmin/consultas-trafico.ts')
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
  const v1 = 'a1'.repeat(16), v2 = 'b2'.repeat(16)
  const enviar = (cuerpo: unknown) => POST(new Request('https://api.example.test/api/public/track', { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': ua }, body: JSON.stringify(cuerpo) }))
  await prisma.siteEvent.deleteMany({})
  for (const e of [
    { kind: 'landing', name: 'pageview', visitorId: v1, path: '/', referrer: 'https://l.facebook.com/x?y=1', utmSource: 'facebook' },
    { kind: 'landing', name: 'pageview', visitorId: v2, path: '/', referrer: '' },
    { kind: 'landing', name: 'engage', visitorId: v1, path: '/', durationSec: 40, scrollPct: 80 },
    { kind: 'landing', name: 'engage', visitorId: v2, path: '/', durationSec: 20, scrollPct: 30 },
    { kind: 'demo', name: 'demo_start', visitorId: v1, role: 'VENDEDOR', path: '/' },
    { kind: 'demo', name: 'demo_view', visitorId: v1, role: 'VENDEDOR', module: 'pos' },
    { kind: 'demo', name: 'demo_end', visitorId: v1, role: 'VENDEDOR', durationSec: 120 },
    { kind: 'demo', name: 'cta_registro', visitorId: v1, path: '/' },
  ]) assert.equal((await enviar(e)).status, 204)
  const filas = await prisma.siteEvent.findMany()
  assert.equal(filas.length, 8)
  assert.ok(filas.every((f: any) => !('ip' in f) && f.device === 'mobile'))
  assert.equal(filas.find((f: any) => f.referrer)?.referrer, 'l.facebook.com', 'solo el host del referente')
  const r = await traficoYDemo('7')
  const k = (lista: any[], clave: string) => lista.find(x => x.clave === clave)
  assert.equal(k(r.landing.kpis, 'visitas').actual, 2)
  assert.equal(k(r.landing.kpis, 'visitantes').actual, 2)
  assert.equal(k(r.landing.kpis, 'tiempo').actual, 30)
  assert.equal(r.landing.scroll.promedioPct, 50)
  assert.deepEqual(r.landing.scroll.buckets.map((b: any) => b.n), [2, 1, 1, 0], 'escalones acumulados')
  assert.deepEqual(r.landing.fuentes.map((f: any) => f.clave).sort(), ['directo', 'facebook'])
  assert.equal(r.landing.dispositivos[0].clave, 'mobile')
  assert.equal(k(r.demo.kpis, 'demos').actual, 1)
  assert.equal(k(r.demo.kpis, 'duracionDemo').actual, 120)
  assert.deepEqual(r.demo.roles.map((x: any) => x.clave), ['VENDEDOR'])
  assert.deepEqual(r.demo.modulos.map((x: any) => x.clave), ['pos'])
  assert.deepEqual(r.demo.conversion, { visitantes: 1, convertidos: 1, porcentaje: 100 })
  await prisma.siteEvent.deleteMany({})
  const vacio = await traficoYDemo('7')
  assert.equal(vacio.landing.sinDatos, true)
  assert.equal(vacio.demo.sinDatos, true)
  assert.equal(vacio.demo.conversion.porcentaje, null, 'sin base no hay porcentaje')
  await prisma.$disconnect()
})

test('segundo factor: PIN incorrecto, bloqueo por usuario, vigencia de 12 h y atado a la sesión', { skip: !activo }, async () => {
  const bcrypt = require('bcryptjs')
  const { prisma } = require('../lib/prisma.ts')
  const { verificarPinDueno, pinVigente } = require('../lib/superadmin/pin.ts')
  const sufijo = Date.now().toString(36)
  const tenant = await prisma.tenant.create({ data: { name: `Pin ${sufijo}`, slug: `pin-${sufijo}` } })
  const usuario = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dueño', pinHash: await bcrypt.hash('4821', 4), pinLength: 4, role: 'ADMIN' } })
  const otro = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Otro', pinHash: await bcrypt.hash('4821', 4), pinLength: 4, role: 'ADMIN' } })
  const sesion = async (userId: string, n: string) => prisma.session.create({ data: { tenantId: tenant.id, userId, level: 'SELLER', deviceId: `d-${sufijo}-${n}`, tokenHash: `h-${sufijo}-${n}`, expiresAt: new Date(Date.now() + 86_400_000) } })
  const s1 = await sesion(usuario.id, '1'), s2 = await sesion(usuario.id, '2'), sOtro = await sesion(otro.id, '3')

  assert.equal(await pinVigente(s1.id), false, 'sin PIN no hay vigencia')
  assert.deepEqual(await verificarPinDueno(usuario.id, s1.id, '0000'), { estado: 'incorrecto', restantes: 4 })
  assert.deepEqual(await verificarPinDueno(usuario.id, s1.id, 'abcd'), { estado: 'incorrecto', restantes: 3 })
  assert.deepEqual(await verificarPinDueno(usuario.id, s1.id, undefined), { estado: 'incorrecto', restantes: 2 })
  assert.equal(await pinVigente(s1.id), false)
  // Correcto: marca SOLO esa sesión y reinicia el conteo.
  assert.deepEqual(await verificarPinDueno(usuario.id, s1.id, '4821'), { estado: 'ok' })
  assert.equal(await pinVigente(s1.id), true)
  assert.equal(await pinVigente(s2.id), false, 'otra sesión del mismo usuario no hereda el PIN')
  assert.equal(await pinVigente(sOtro.id), false, 'otro usuario tampoco')
  assert.equal(Number((await prisma.$queryRaw`SELECT count(*) AS n FROM "SuperadminPinGuard" WHERE "userId" = ${usuario.id}`)[0].n), 0)

  // Vigencia: a las 12 h vence, medida con el reloj de la base.
  await prisma.$executeRaw`UPDATE "Session" SET "superadminVerifiedAt" = (now() AT TIME ZONE 'UTC') - interval '11 hours 59 minutes' WHERE "id" = ${s1.id}`
  assert.equal(await pinVigente(s1.id), true)
  await prisma.$executeRaw`UPDATE "Session" SET "superadminVerifiedAt" = (now() AT TIME ZONE 'UTC') - interval '12 hours 1 minute' WHERE "id" = ${s1.id}`
  assert.equal(await pinVigente(s1.id), false, 'vencido')
  await prisma.session.update({ where: { id: s2.id }, data: { revokedAt: new Date() } })
  await prisma.$executeRaw`UPDATE "Session" SET "superadminVerifiedAt" = (now() AT TIME ZONE 'UTC') WHERE "id" = ${s2.id}`
  assert.equal(await pinVigente(s2.id), false, 'sesión revocada')

  // Bloqueo: 5 fallos y ni el PIN correcto entra; otro usuario no se afecta.
  for (let i = 0; i < 4; i++) await verificarPinDueno(usuario.id, s1.id, '1111')
  assert.equal((await verificarPinDueno(usuario.id, s1.id, '1111')).estado, 'bloqueado')
  assert.equal((await verificarPinDueno(usuario.id, s1.id, '4821')).estado, 'bloqueado', 'bloqueado aunque el PIN sea el correcto')
  assert.equal(await pinVigente(s1.id), false)
  assert.deepEqual(await verificarPinDueno(otro.id, sOtro.id, '4821'), { estado: 'ok' })
  // Intentos en paralelo: nunca se verifican más de 5.
  await prisma.$executeRaw`DELETE FROM "SuperadminPinGuard" WHERE "userId" = ${usuario.id}`
  const paralelo = await Promise.all(Array.from({ length: 12 }, () => verificarPinDueno(usuario.id, s1.id, '2222')))
  assert.equal(paralelo.filter((r: any) => r.estado === 'incorrecto').length, 4)
  assert.equal(paralelo.filter((r: any) => r.estado === 'bloqueado').length, 8)
  // Vencido el bloqueo, vuelve a permitir.
  await prisma.$executeRaw`UPDATE "SuperadminPinGuard" SET "lockedUntil" = (now() AT TIME ZONE 'UTC') - interval '1 second' WHERE "userId" = ${usuario.id}`
  assert.deepEqual(await verificarPinDueno(usuario.id, s1.id, '4821'), { estado: 'ok' })
  await prisma.$disconnect()
})
