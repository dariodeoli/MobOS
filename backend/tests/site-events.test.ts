// Tráfico propio (#panel de plataforma): validación pura y límites del endpoint
// público. Se ejecuta desde backend/tests/run-unit.cjs.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BUCKETS_SCROLL, bucketScroll, clasificarDispositivo, esBot, normalizarReferente, normalizarRuta, porcentaje, pideNoSerMedido, promedio, validarEvento } from '../lib/site-events'

process.env.MOBOS_TRUST_PROXY = 'true'
process.env.MOBOS_TRACK_MINUTE_MAX = '3'
process.env.MOBOS_TRACK_DAILY_MAX = '5'
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
  assert.equal(normalizarRuta('/demo/ventas?a=b'), '/demo/ventas')
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
