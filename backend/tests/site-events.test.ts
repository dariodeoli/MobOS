// Tráfico propio (#panel de plataforma): validación pura y límites del endpoint
// público. Se ejecuta desde backend/tests/run-unit.cjs.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BUCKETS_SCROLL, bucketScroll, clasificarDispositivo, esBot, leerCuerpoAcotado, normalizarModulo, normalizarReferente, normalizarRuta, porcentaje, pideNoSerMedido, promedio, purgarEventosViejos, resetPurgaParaPruebas, validarEvento } from '../lib/site-events'
import { globalCapExceeded, resetRateLimitsForTests } from '../lib/rate-limit'

process.env.MOBOS_TRUST_PROXY = 'true'
process.env.MOBOS_TRACK_MINUTE_MAX = '3'
process.env.MOBOS_TRACK_DAILY_MAX = '5'
process.env.MOBOS_TRACK_GLOBAL_MINUTE_MAX = '3'
const { POST } = require('../app/api/public/track/route.ts')

const UA_PC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const UA_CEL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ID = 'a'.repeat(32)
const valido = { name: 'pageview', kind: 'landing', visitorId: ID, path: '/precios?x=1#a', referrer: 'https://www.google.com/search?q=mobos', utmSource: 'Facebook' }

test('validarEvento: reduce a campos permitidos, sin query ni IP, con dispositivo del UA', () => {
  const e = validarEvento({ ...valido, ip: '1.2.3.4', extra: 'x', email: 'a@b.c' }, UA_CEL)!
  assert.equal(e.path, '/precios')
  assert.equal(e.referrer, 'www.google.com'.replace('www.', ''))
  assert.equal(e.utmSource, 'facebook')
  assert.equal(e.device, 'mobile')
  assert.deepEqual(Object.keys(e).sort(), ['device', 'durationSec', 'kind', 'module', 'name', 'path', 'referrer', 'role', 'scrollPct', 'utmSource', 'visitorId'])
  assert.equal(clasificarDispositivo(UA_PC), 'desktop')
  assert.equal(clasificarDispositivo('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet')
})

test('validarEvento: rechaza nombres, tipos e ids fuera de la lista y roles inválidos', () => {
  assert.equal(validarEvento({ ...valido, name: 'drop_table' }, UA_PC), null)
  assert.equal(validarEvento({ ...valido, kind: 'admin' }, UA_PC), null)
  assert.equal(validarEvento({ ...valido, visitorId: 'no-es-hex' }, UA_PC), null)
  assert.equal(validarEvento({ ...valido, visitorId: 'A'.repeat(32) }, UA_PC), null)
  assert.equal(validarEvento([valido], UA_PC), null)
  assert.equal(validarEvento(null, UA_PC), null)
  assert.equal(validarEvento({ name: 'demo_start', kind: 'demo', visitorId: ID, role: 'SUPERADMIN' }, UA_PC), null, 'demo_start exige un rol conocido')
  assert.equal(validarEvento({ name: 'demo_start', kind: 'demo', visitorId: ID, role: 'TECNICO' }, UA_PC)!.role, 'TECNICO')
})

test('validarEvento: duración y scroll solo en engage/demo_end, acotados y en escalones', () => {
  const engage = validarEvento({ ...valido, name: 'engage', durationSec: 999999, scrollPct: 87 }, UA_PC)!
  assert.equal(engage.durationSec, 4 * 3600)
  assert.equal(engage.scrollPct, 75)
  const vista = validarEvento({ ...valido, durationSec: 50, scrollPct: 100 }, UA_PC)!
  assert.equal(vista.durationSec, null)
  assert.equal(vista.scrollPct, null)
  assert.equal(validarEvento({ name: 'demo_end', kind: 'demo', visitorId: ID, role: 'ADMIN', durationSec: -4 }, UA_PC)!.durationSec, null)
})

test('helpers: scroll por escalones, ruta segura, referente sin ruta, bots, DNT, promedios', () => {
  assert.deepEqual([0, 10, 25, 49, 50, 76, 100, 250].map(bucketScroll), [0, 0, 25, 25, 50, 75, 100, 100])
  assert.equal(bucketScroll('x'), null)
  assert.deepEqual([...BUCKETS_SCROLL], [0, 25, 50, 75, 100])
  assert.equal(normalizarRuta('/demo/ventas?a=b'), '/demo')
  assert.equal(normalizarRuta('javascript:alert(1)'), null)
  assert.equal(normalizarRuta('/<script>'), null)
  assert.equal(normalizarReferente('https://l.facebook.com/l.php?u=secreto'), 'l.facebook.com')
  assert.equal(normalizarReferente('no-url'), null)
  assert.equal(esBot('Googlebot/2.1 (+http://www.google.com/bot.html)'), true)
  assert.equal(esBot('curl/8.0.1'), true)
  assert.equal(esBot(null), true)
  assert.equal(esBot(UA_PC), false)
  assert.equal(pideNoSerMedido(new Headers({ dnt: '1' })), true)
  assert.equal(pideNoSerMedido(new Headers({ 'sec-gpc': '1' })), true)
  assert.equal(pideNoSerMedido(new Headers()), false)
  assert.equal(promedio([10, 20, null, undefined]), 15)
  assert.equal(promedio([]), null)
  assert.equal(porcentaje(1, 3), 33.3)
  assert.equal(porcentaje(1, 0), null, 'sin base no hay porcentaje inventado')
})

const enviar = (ip: string, cuerpo: string, headers: Record<string, string> = {}) => POST(new Request('https://api.example.test/api/public/track', {
  method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA_PC, 'x-forwarded-for': ip, ...headers }, body: cuerpo,
}))

test('endpoint: DNT, bots, JSON roto y eventos inválidos responden 204 sin guardar; el cuerpo grande se corta con 413', async () => {
  assert.equal((await enviar('198.51.100.1', '{', {})).status, 204, 'JSON roto')
  assert.equal((await enviar('198.51.100.2', JSON.stringify({ ...valido, name: 'x' }))).status, 204, 'evento inválido')
  assert.equal((await enviar('198.51.100.3', JSON.stringify(valido), { dnt: '1' })).status, 204, 'DNT')
  assert.equal((await enviar('198.51.100.4', JSON.stringify(valido), { 'user-agent': 'Googlebot/2.1' })).status, 204, 'bot')
  assert.equal((await enviar('198.51.100.5', 'x'.repeat(5000))).status, 413, 'cuerpo real grande')
  assert.equal((await enviar('198.51.100.6', 'x', { 'content-length': '999999' })).status, 413, 'content-length declarado grande')
})

test('endpoint: límite por minuto y cupo diario por IP (429 con Retry-After), cada IP el suyo', async () => {
  const ip = '203.0.113.50'
  const estados: number[] = []
  let retry = 0
  for (let i = 0; i < 6; i += 1) {
    const r = await enviar(ip, '{')
    estados.push(r.status)
    if (r.status === 429) retry = Number(r.headers.get('retry-after') || 0)
  }
  assert.deepEqual(estados, [204, 204, 204, 429, 429, 429])
  assert.ok(retry > 0)
  assert.equal((await enviar('203.0.113.51', '{')).status, 204)
})

test('cardinalidad: ruta y módulo de lista cerrada, utm acotado', () => {
  assert.equal(normalizarRuta('/'), '/')
  assert.equal(normalizarRuta('/pos/abc123/9?x=1'), '/pos')
  assert.equal(normalizarRuta('/privacidad'), '/privacidad')
  assert.equal(normalizarRuta('/ruta-inventada-' + 'x'.repeat(50)), 'otras')
  assert.equal(normalizarRuta('/u/serial-123'), 'otras')
  assert.equal(normalizarModulo('pos'), 'pos')
  assert.equal(normalizarModulo('modulo-raro-123'), 'otras')
  assert.equal(normalizarModulo(''), null)
  assert.equal(validarEvento({ ...valido, path: '/zzz/' + Math.random() }, UA_PC)!.path, 'otras')
  assert.equal(validarEvento({ ...valido, utmSource: 'a.b' }, UA_PC)!.utmSource, null)
  assert.equal(validarEvento({ ...valido, utmSource: 'x'.repeat(41) }, UA_PC)!.utmSource, 'x'.repeat(40), 'se trunca a 40')
  assert.equal(validarEvento({ ...valido, utmSource: 'Meta_ads-1' }, UA_PC)!.utmSource, 'meta_ads-1')
  assert.equal(validarEvento({ name: 'demo_view', kind: 'demo', visitorId: ID, module: 'inventado' }, UA_PC)!.module, 'otras')
  assert.equal(normalizarReferente('https://' + 'a'.repeat(90) + '.com/'), null)
})

test('leerCuerpoAcotado: corta por stream aunque no haya content-length (chunked)', async () => {
  const chunk = new TextEncoder().encode('x'.repeat(1000))
  let enviados = 0
  const stream = new ReadableStream<Uint8Array>({ pull(c) { enviados += 1; if (enviados > 50) c.close(); else c.enqueue(chunk) } })
  const req = new Request('https://api.example.test/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
  assert.equal(req.headers.get('content-length'), null)
  assert.equal(await leerCuerpoAcotado(req), null)
  assert.ok(enviados < 10, 'no se consume todo el stream')
  assert.equal(await leerCuerpoAcotado(new Request('https://api.example.test/x', { method: 'POST', body: 'hola' })), 'hola')
  const r = await enviar('198.51.100.77', '', { 'content-length': '' })
  assert.equal(r.status, 204)
  const grande = new Request('https://api.example.test/api/public/track', { method: 'POST', headers: { 'user-agent': UA_PC, 'x-forwarded-for': '198.51.100.78' }, body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('x'.repeat(3000))); c.close() } }), duplex: 'half' } as RequestInit)
  assert.equal((await POST(grande)).status, 413)
})

test('sin IP de confianza: tope global por proceso, 204 sin insertar', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require('../lib/prisma')
  const original = prisma.siteEvent.create
  let insertados = 0
  prisma.siteEvent.create = async () => { insertados += 1; return {} }
  const originalDelete = prisma.siteEvent.deleteMany
  prisma.siteEvent.deleteMany = async () => ({ count: 0 })
  const proxy = process.env.MOBOS_TRUST_PROXY
  delete process.env.MOBOS_TRUST_PROXY
  resetRateLimitsForTests()
  try {
    const estados: number[] = []
    for (let i = 0; i < 6; i += 1) estados.push((await enviar('198.51.100.90', JSON.stringify(valido))).status)
    assert.deepEqual(estados, [204, 204, 204, 204, 204, 204], 'nunca rompe la landing')
    assert.equal(insertados, 3, 'solo caben 3 por minuto en todo el proceso')
    // Con IP de confianza el tope global no aplica (rige el límite por IP).
    process.env.MOBOS_TRUST_PROXY = 'true'
    await enviar('198.51.100.91', JSON.stringify(valido))
    assert.equal(insertados, 4)
  } finally {
    prisma.siteEvent.create = original
    prisma.siteEvent.deleteMany = originalDelete
    if (proxy === undefined) delete process.env.MOBOS_TRUST_PROXY
    else process.env.MOBOS_TRUST_PROXY = proxy
    resetRateLimitsForTests()
  }
  assert.equal(globalCapExceeded('otra', 1, 1000), false)
  assert.equal(globalCapExceeded('otra', 1, 1000), true)
  resetRateLimitsForTests()
})

test('retención: borra eventos de más de 90 días como mucho una vez por día', async () => {
  resetPurgaParaPruebas()
  const llamadas: Date[] = []
  const db = { siteEvent: { deleteMany: async (a: { where: { createdAt: { lt: Date } } }) => { llamadas.push(a.where.createdAt.lt); return { count: 7 } } } }
  const t0 = Date.UTC(2027, 0, 20)
  assert.equal(await purgarEventosViejos(db, t0), 7)
  assert.equal(llamadas[0].getTime(), t0 - 90 * 86_400_000)
  assert.equal(await purgarEventosViejos(db, t0 + 3_600_000), null, 'ya corrió hoy')
  assert.equal(await purgarEventosViejos(db, t0 + 25 * 3_600_000), 7)
  assert.equal(llamadas.length, 2)
  resetPurgaParaPruebas()
})
