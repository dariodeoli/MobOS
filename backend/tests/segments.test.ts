import assert from 'node:assert/strict'
import test from 'node:test'
import { DIA_MS } from '../lib/collections'
import { clasificarCliente, contactoReciente, diasDesde, motivoNoElegible, opcionesSegmento, type ClienteParaSegmento } from '../lib/segments'

const AHORA = new Date('2026-09-20T12:00:00.000Z')
const OPCIONES = opcionesSegmento({ days: 180, minOrders: 3, category: 'Celulares', cooldownDays: 30 })
const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA_MS)

const cliente = (extra: Partial<ClienteParaSegmento> = {}): ClienteParaSegmento => ({
  id: 'c1', name: 'Ana', phone: '981123456', countryCode: '+595', email: null, pricingTier: 'RETAIL',
  acceptsWhatsappMarketing: true, marketingContactedAt: null, lastOrderAt: hace(200), orderCount: 2,
  totalSpentPyg: 100000, outstandingPyg: 0, categories: ['Celulares'], ...extra,
})

test('opciones del segmento: defaults y topes', () => {
  assert.deepEqual(opcionesSegmento({}), { days: 180, minOrders: 3, category: null, cooldownDays: 30 })
  assert.equal(opcionesSegmento({ days: 99999 }).days, 3650)
  assert.equal(opcionesSegmento({ days: 'x' }).days, 180)
  assert.equal(opcionesSegmento({ minOrders: 0 }).minOrders, 1)
  assert.equal(opcionesSegmento({ cooldownDays: -3 }).cooldownDays, 30)
})

test('días desde: fecha inválida o ausente es null, nunca NaN', () => {
  assert.equal(diasDesde(hace(10), AHORA), 10)
  assert.equal(diasDesde(null, AHORA), null)
  assert.equal(diasDesde('no-es-fecha', AHORA), null)
  assert.equal(diasDesde(undefined, AHORA), null)
})

test('inactivos: sin compras queda afuera, justo en el límite entra', () => {
  assert.equal(clasificarCliente(cliente({ lastOrderAt: hace(180) }), 'INACTIVE', OPCIONES, AHORA), true)
  assert.equal(clasificarCliente(cliente({ lastOrderAt: hace(179) }), 'INACTIVE', OPCIONES, AHORA), false)
  assert.equal(clasificarCliente(cliente({ orderCount: 0, lastOrderAt: null }), 'INACTIVE', OPCIONES, AHORA), false)
  // Fecha inválida: no se puede probar inactividad, así que no entra.
  assert.equal(clasificarCliente(cliente({ lastOrderAt: new Date('invalid') }), 'INACTIVE', OPCIONES, AHORA), false)
  assert.equal(clasificarCliente(cliente({ lastOrderAt: hace(4000) }), 'INACTIVE', OPCIONES, AHORA), true)
})

test('nunca compraron y recurrentes usan la cantidad con borde inclusivo', () => {
  assert.equal(clasificarCliente(cliente({ orderCount: 0, lastOrderAt: null }), 'NO_PURCHASES', OPCIONES, AHORA), true)
  assert.equal(clasificarCliente(cliente({ orderCount: 1 }), 'NO_PURCHASES', OPCIONES, AHORA), false)
  assert.equal(clasificarCliente(cliente({ orderCount: 3 }), 'FREQUENT', OPCIONES, AHORA), true)
  assert.equal(clasificarCliente(cliente({ orderCount: 2 }), 'FREQUENT', OPCIONES, AHORA), false)
})

test('categoría: compara normalizada (mayúsculas y acentos)', () => {
  assert.equal(clasificarCliente(cliente({ categories: ['celulares'] }), 'CATEGORY', OPCIONES, AHORA), true)
  assert.equal(clasificarCliente(cliente({ categories: ['Celulares '] }), 'CATEGORY', OPCIONES, AHORA), true)
  assert.equal(clasificarCliente(cliente({ categories: ['Audio'] }), 'CATEGORY', OPCIONES, AHORA), false)
  assert.equal(clasificarCliente(cliente({ orderCount: 0, categories: ['Celulares'] }), 'CATEGORY', OPCIONES, AHORA), false)
  assert.equal(clasificarCliente(cliente({ categories: ['Celulares'] }), 'CATEGORY', opcionesSegmento({ category: '' }), AHORA), false)
})

test('enfriamiento: borde exacto permitido, 0 lo desactiva', () => {
  assert.equal(contactoReciente({ marketingContactedAt: hace(29) }, AHORA, 30), true)
  assert.equal(contactoReciente({ marketingContactedAt: hace(30) }, AHORA, 30), false)
  assert.equal(contactoReciente({ marketingContactedAt: hace(1) }, AHORA, 0), false)
  assert.equal(contactoReciente({ marketingContactedAt: null }, AHORA, 30), false)
})

test('elegibilidad para WhatsApp: teléfono, opt-in y enfriamiento', () => {
  assert.equal(motivoNoElegible(cliente(), AHORA, 30), null)
  assert.equal(motivoNoElegible(cliente({ phone: null }), AHORA, 30), 'sin_telefono')
  assert.equal(motivoNoElegible(cliente({ phone: '   ' }), AHORA, 30), 'sin_telefono')
  assert.equal(motivoNoElegible(cliente({ acceptsWhatsappMarketing: false }), AHORA, 30), 'sin_opt_in')
  assert.equal(motivoNoElegible(cliente({ marketingContactedAt: hace(2) }), AHORA, 30), 'contactado_reciente')
})
