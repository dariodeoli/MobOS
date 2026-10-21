import assert from 'node:assert/strict'
import test from 'node:test'
import { CATEGORIES, DEFAULTS, EMAIL_PREFIX, defaultKeys, deletedKeysFrom, isCampaignKey, planSeed, withDeletedKey } from '../lib/message-templates'

const todas = CATEGORIES.flatMap((category) => DEFAULTS[category])

test('plantillas nuevas del plan: pedido confirmado, sobre pedido, garantía, cotización y reseña', () => {
  const claves = new Set(todas.map((item) => item.key))
  for (const key of ['pedido_confirmado', 'sobre_pedido_llego', 'garantia_registrada', 'cotizacion_enviada', 'resena']) assert.ok(claves.has(key), key)
  assert.ok(!claves.has('recibido'), 'recibido pasó a pedido_confirmado')
})

test('cada evento nuevo tiene su versión correo con prefijo email., asunto y canal', () => {
  for (const evento of ['pedido_confirmado', 'sobre_pedido_llego', 'garantia_registrada', 'cotizacion_enviada', 'resena']) {
    const correo = todas.find((item) => item.key === `${EMAIL_PREFIX}${evento}`)
    assert.ok(correo, evento)
    assert.equal(correo.channel, 'email')
    assert.ok(correo.subject && correo.subject.length <= 200)
    assert.ok(correo.body.length <= 1200)
  }
  for (const item of todas.filter((x) => x.channel === 'whatsapp')) assert.ok(!item.key.startsWith(EMAIL_PREFIX) && !item.subject)
  for (const item of todas.filter((x) => x.channel === 'email')) assert.ok(item.key.startsWith(EMAIL_PREFIX) && item.subject)
})

test('claves únicas, cuerpos dentro del límite y variables conocidas', () => {
  assert.equal(new Set(todas.map((item) => item.key)).size, todas.length)
  const conocidas = new Set(['cliente', 'nombre', 'empresa', 'pedido', 'total', 'saldo_pendiente', 'producto', 'sucursal', 'seguimiento', 'reservation_until', 'garantia', 'garantia_hasta', 'cotizacion', 'vigencia', 'enlace', 'equipo', 'estado', 'vencimiento', 'dias_atraso'])
  for (const item of todas) {
    assert.ok(item.body.length <= 1200, item.key)
    for (const [, nombre] of `${item.body} ${item.subject || ''}`.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)) assert.ok(conocidas.has(nombre), `${item.key}: {{${nombre}}}`)
  }
})

test('la siembra es idempotente: la segunda corrida no agrega nada', () => {
  for (const category of CATEGORIES) {
    const primera = planSeed(category, [])
    assert.equal(primera.length, DEFAULTS[category].length)
    assert.deepEqual(planSeed(category, primera.map((item) => item.key)), [])
  }
})

test('la siembra no duplica lo existente ni revive lo que la empresa borró', () => {
  const faltan = planSeed('ORDERS', ['ready_for_pickup', 'email.ready_for_pickup'], ['resena', 'email.pedido_confirmado'])
  const claves = faltan.map((item) => item.key)
  assert.ok(!claves.includes('ready_for_pickup') && !claves.includes('email.ready_for_pickup'))
  assert.ok(!claves.includes('email.pedido_confirmado'))
  assert.ok(claves.includes('pedido_confirmado'))
  assert.deepEqual(planSeed('CUSTOMERS', [], ['resena', 'email.resena']).map((item) => item.key).filter((key) => key.endsWith('resena')), [])
})

test('las borradas se recuerdan en los ajustes sin pisar el resto', () => {
  const ajustes = { moduleStore: { version: 1 }, otro: 1 }
  const uno = withDeletedKey(ajustes, 'resena')
  const dos = withDeletedKey(uno, 'email.resena')
  assert.deepEqual(deletedKeysFrom(dos), ['email.resena', 'resena'])
  assert.deepEqual(withDeletedKey(dos, 'resena'), dos)
  assert.equal((dos as { otro: number }).otro, 1)
  assert.deepEqual(deletedKeysFrom(null), [])
  assert.ok(defaultKeys().has('resena') && !defaultKeys().has('mi_plantilla'))
})

test('solo las plantillas de campañas dependen del módulo de mensajes', () => {
  for (const key of ['promocion', 'recompra', 'mayorista', 'email.promocion']) assert.ok(isCampaignKey(key), key)
  for (const key of ['pedido_confirmado', 'resena', 'seguimiento', 'cuota_vencida', 'cotizacion_enviada']) assert.ok(!isCampaignKey(key), key)
})
