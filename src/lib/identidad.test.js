import test from 'node:test'
import assert from 'node:assert/strict'
import { identidadDeUsuario } from './identidad.js'

test('identidadDeUsuario normaliza el objeto unificado y el legacy', () => {
  const unificado = identidadDeUsuario({ nombre: 'Darío Deoli', picture: 'https://x/foto.jpg', hasAvatar: true })
  assert.equal(unificado.nombre, 'Darío Deoli')
  assert.equal(unificado.primerNombre, 'Darío')
  assert.equal(unificado.picture, 'https://x/foto.jpg')
  assert.equal(unificado.hasAvatar, true)

  const legacy = identidadDeUsuario({ name: 'Vendedor Demo', avatarUrl: '', tieneFoto: false })
  assert.equal(legacy.primerNombre, 'Vendedor')
  assert.equal(legacy.picture, '')
  assert.equal(legacy.hasAvatar, false)
})

test('identidadDeUsuario cae a Sistema sin datos', () => {
  assert.equal(identidadDeUsuario().primerNombre, 'Sistema')
  assert.equal(identidadDeUsuario(null).nombre, 'Sistema')
})
