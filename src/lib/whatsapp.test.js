import test from 'node:test'
import assert from 'node:assert/strict'
import { enlaceWhatsApp } from './whatsapp.js'

test('conserva el enlace público de sucursal si no hay mensaje', () => {
  assert.equal(enlaceWhatsApp('https://wa.me/595981123456'), 'https://wa.me/595981123456')
})

test('precarga el mensaje sin enviarlo', () => {
  const url = new URL(enlaceWhatsApp('https://wa.me/595981123456', 'Hola, consulto por garantía'))
  assert.equal(url.pathname, '/595981123456')
  assert.equal(url.searchParams.get('text'), 'Hola, consulto por garantía')
})

test('rechaza destinos que no sean números de WhatsApp seguros', () => {
  assert.equal(enlaceWhatsApp('javascript:alert(1)', 'Hola'), '')
  assert.equal(enlaceWhatsApp('https://example.com/595981123456', 'Hola'), '')
  assert.equal(enlaceWhatsApp('https://wa.me/not-a-number', 'Hola'), '')
})
