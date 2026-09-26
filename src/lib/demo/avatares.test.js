// #219: las fotos del equipo demo son retratos ficticios locales (data URI),
// deterministas por id y sin llamadas externas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AVATARES_DEMO, avatarDemo } from './avatares.js'

test('los avatares demo son data URI SVG locales (sin red)', () => {
  assert.ok(AVATARES_DEMO.length >= 4, 'hay varias fotos para repartir')
  for (const foto of AVATARES_DEMO) {
    assert.match(foto, /^data:image\/svg\+xml,/, 'la foto es un SVG embebido')
    assert.ok(!/https?:/i.test(foto), 'la foto no llama a ningún servicio externo')
    assert.ok(decodeURIComponent(foto).includes('<svg'), 'el contenido es un SVG válido')
  }
})

test('la foto demo es determinista por id y solo para el equipo demo', () => {
  assert.equal(avatarDemo('demo-user'), avatarDemo('demo-user'), 'el mismo id devuelve la misma foto')
  assert.equal(avatarDemo('demo-user-tecnico'), avatarDemo('demo-user-tecnico'))
  assert.equal(avatarDemo(''), '')
  assert.equal(avatarDemo('usuario-real'), '', 'fuera de la demo no inventa fotos')
  assert.equal(avatarDemo('123456'), '')
})

test('el equipo demo recibe fotos repartidas (no todos la misma)', () => {
  const ids = ['demo-user', 'demo-user-gerente', 'demo-user-vendedor', 'demo-user-cajera', 'demo-user-tecnico', 'demo-user-vendedora']
  const fotos = ids.map((id) => avatarDemo(id))
  for (const foto of fotos) assert.ok(AVATARES_DEMO.includes(foto), 'la foto sale del set')
  assert.ok(new Set(fotos).size >= 3, 'las fotos se reparten entre el equipo')
})
