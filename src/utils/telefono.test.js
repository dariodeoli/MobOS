import { test } from 'node:test'
import assert from 'node:assert/strict'
import { telefonoVisible, whatsappUrl } from './telefono.js'

test('teléfono visible: Paraguay con 9 dígitos se agrupa 3-3-3 y lleva +595', () => {
  assert.equal(telefonoVisible('0981123456'), '+595 981 123 456')
  assert.equal(telefonoVisible('981123456'), '+595 981 123 456')
  assert.equal(telefonoVisible('595981123456'), '+595 981 123 456')
  assert.equal(telefonoVisible('+595 981 123 456'), '+595 981 123 456')
})

test('teléfono visible: otros países conservan su código', () => {
  assert.equal(telefonoVisible('11987654321', '+55'), '+55 11987654321')
  assert.equal(telefonoVisible('91155554444', '+54'), '+54 91155554444')
})

test('teléfono visible: vacío devuelve cadena vacía', () => {
  assert.equal(telefonoVisible(''), '')
  assert.equal(telefonoVisible(null), '')
  assert.equal(telefonoVisible(undefined, '+595'), '')
})

test('whatsappUrl arma el enlace con el número internacional y el mensaje escapado', () => {
  assert.equal(whatsappUrl('0981123456', 'Hola Ana'), 'https://wa.me/595981123456?text=Hola%20Ana')
  assert.equal(whatsappUrl('11987654321', 'Hola', '+55'), 'https://wa.me/5511987654321?text=Hola')
  // Sin teléfono no hay enlace; sin mensaje, el texto va vacío.
  assert.equal(whatsappUrl('', 'Hola'), '')
  assert.equal(whatsappUrl(null), '')
  assert.equal(whatsappUrl('981123456'), 'https://wa.me/595981123456?text=')
})
