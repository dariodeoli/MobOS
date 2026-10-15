import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
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

// #491: los navegadores normalizan backslash y controles antes de navegar.
test('el retorno no permite escapar del origen con backslash o controles', () => {
  for (const destino of ['/\\example.invalid', '/\\\\example.invalid', '/\t/example.invalid', '/\n/example.invalid', '/\r/example.invalid', '/pos\\..\\example.invalid']) {
    assert.equal(rutaInterna(destino), '', JSON.stringify(destino))
    assert.equal(enlaceLogin(destino), '/login', 'el enlace tampoco persiste un retorno peligroso')
  }
  assert.equal(rutaInterna('/pedidos/abc?volver=%2Fpos#pago'), '/pedidos/abc?volver=%2Fpos#pago')
})

test('volver del login reutiliza el guard seguro y conserva rutas válidas', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
  const declaracion = app.match(/function volverSeguro\(valor\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(declaracion, 'el retorno del login tiene un guard explícito')
  const volver = runInNewContext(`(${declaracion})`, { rutaInterna })
  assert.equal(volver('/\\example.invalid'), '')
  assert.equal(volver('/\t/example.invalid'), '')
  assert.equal(volver('/pedidos/abc?tab=pago#detalle'), '/pedidos/abc?tab=pago#detalle')
})
