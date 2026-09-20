import assert from 'node:assert/strict'
import test from 'node:test'
import { enlaceLogin, rutaInterna } from './urls.js'

test('rutaInterna solo acepta rutas del propio origen', () => {
  assert.equal(rutaInterna('/u/356789012345678'), '/u/356789012345678')
  assert.equal(rutaInterna('  /producto/IPH-15-128?q=1  '), '/producto/IPH-15-128?q=1')
  assert.equal(rutaInterna('//otro-sitio.com/robo'), '', 'no acepta protocol-relative')
  assert.equal(rutaInterna('https://otro-sitio.com'), '')
  assert.equal(rutaInterna('u/356789012345678'), '')
  assert.equal(rutaInterna(''), '')
  assert.equal(rutaInterna(undefined), '')
})

test('enlaceLogin guarda el destino para volver después de entrar', () => {
  assert.equal(enlaceLogin('/u/356789012345678'), '/login?next=%2Fu%2F356789012345678')
  assert.equal(enlaceLogin('/inventario/unidades?q=ABC'), '/login?next=%2Finventario%2Funidades%3Fq%3DABC')
  assert.equal(enlaceLogin('//otro-sitio.com'), '/login')
  assert.equal(enlaceLogin(''), '/login')
})
