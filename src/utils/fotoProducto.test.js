import test from 'node:test'
import assert from 'node:assert/strict'
import { LADO_FOTO_PRODUCTO, MAX_FOTO_BYTES, ladoSalida, moverFoto, nombreWebP, recorteCentrado, reubicarFoto, validarArchivoFoto } from './fotoProducto.js'

test('validarArchivoFoto: tipo, vacío y tope de 5 MiB', () => {
  assert.equal(validarArchivoFoto({ type: 'image/webp', size: 1000 }), '')
  assert.equal(validarArchivoFoto({ type: 'IMAGE/PNG', size: 1000 }), '')
  assert.match(validarArchivoFoto({ type: 'image/svg+xml', size: 10 }), /JPG, PNG o WebP/)
  assert.match(validarArchivoFoto({ type: 'image/heic', size: 10 }), /JPG, PNG o WebP/)
  assert.match(validarArchivoFoto({ type: 'image/png', size: 0 }), /vacía/)
  assert.match(validarArchivoFoto({ type: 'image/png', size: MAX_FOTO_BYTES + 1 }), /5 MiB/)
  assert.equal(validarArchivoFoto({ type: 'image/png', size: MAX_FOTO_BYTES }), '')
  assert.match(validarArchivoFoto(null), /Elegí/)
})

test('recorteCentrado: cuadrado más grande y centrado', () => {
  assert.deepEqual(recorteCentrado(4000, 3000), { x: 500, y: 0, lado: 3000 })
  assert.deepEqual(recorteCentrado(3000, 4000), { x: 0, y: 500, lado: 3000 })
  assert.deepEqual(recorteCentrado(800, 800), { x: 0, y: 0, lado: 800 })
  assert.deepEqual(recorteCentrado(0, 0), { x: 0, y: 0, lado: 0 })
  // Siempre dentro de la foto.
  for (const [w, h] of [[1001, 777], [333, 1999], [5, 6]]) {
    const r = recorteCentrado(w, h)
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.lado <= w && r.y + r.lado <= h, `${w}x${h}`)
  }
})

test('ladoSalida: comprime hasta 800 px y nunca agranda', () => {
  assert.equal(ladoSalida(3000), LADO_FOTO_PRODUCTO)
  assert.equal(ladoSalida(500), 500)
  assert.equal(ladoSalida(3000, 160), 160)
  assert.equal(ladoSalida(0), LADO_FOTO_PRODUCTO)
})

test('nombreWebP: nombre seguro con extensión webp', () => {
  assert.equal(nombreWebP('Mi Foto Ñandú.JPG'), 'Mi-Foto-Nandu.webp')
  assert.equal(nombreWebP('IMG_0001.heic', '-mini'), 'IMG_0001-mini.webp')
  assert.equal(nombreWebP(''), 'foto.webp')
  assert.equal(nombreWebP('???.png'), 'foto.webp')
})

test('moverFoto y reubicarFoto: reordenan sin perder fotos', () => {
  const fotos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(moverFoto(fotos, 'b', -1).map((f) => f.id), ['b', 'a', 'c'])
  assert.deepEqual(moverFoto(fotos, 'b', 1).map((f) => f.id), ['a', 'c', 'b'])
  assert.equal(moverFoto(fotos, 'a', -1), fotos)
  assert.equal(moverFoto(fotos, 'c', 1), fotos)
  assert.equal(moverFoto(fotos, 'z', 1), fotos)
  assert.deepEqual(reubicarFoto(fotos, 'a', 'c').map((f) => f.id), ['b', 'c', 'a'])
  assert.deepEqual(reubicarFoto(fotos, 'c', 'a').map((f) => f.id), ['c', 'a', 'b'])
  assert.equal(reubicarFoto(fotos, 'a', 'a'), fotos)
})
