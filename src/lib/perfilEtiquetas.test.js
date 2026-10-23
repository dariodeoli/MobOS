import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync('src/components/customers/CustomerProfile.jsx', 'utf8')

test('la ficha no pisa lo escrito (etiquetas y seguro) cuando llega el perfil', () => {
  const efecto = fuente.slice(fuente.indexOf('const editado = useRef'), fuente.indexOf('// El seguro afecta costo real'))
  assert.match(efecto, /if \(!editado\.current\.tags\) setTagsTexto/)
  assert.match(efecto, /if \(!editado\.current\.seguro\)/)
  assert.match(fuente, /editado\.current\.tags = true; setTagsTexto/)
  assert.match(fuente, /editado\.current\.tags = false/)
})
