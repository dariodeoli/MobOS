import assert from 'node:assert/strict'
import test from 'node:test'
import { escalaAjuste, recorteCuadrado } from './recorte.js'

test('sin zoom ni desplazamiento recorta el centro', () => {
  const recorte = recorteCuadrado({ ancho: 800, alto: 600, escala: 1 })
  assert.equal(recorte.lado, 240)
  assert.equal(recorte.x, 280)
  assert.equal(recorte.y, 180)
})

test('el recorte nunca se sale de la imagen', () => {
  const recorte = recorteCuadrado({ ancho: 300, alto: 200, escala: 1 })
  assert.equal(recorte.lado, 200)
  assert.ok(recorte.x >= 0 && recorte.x + recorte.lado <= 300)
  assert.ok(recorte.y >= 0 && recorte.y + recorte.lado <= 200)
})

test('el zoom achica el cuadrado visible', () => {
  const recorte = recorteCuadrado({ ancho: 800, alto: 600, escala: 2 })
  assert.equal(recorte.lado, 120)
})

test('arrastrar la imagen hacia la derecha muestra la parte izquierda', () => {
  const arrastrada = recorteCuadrado({ ancho: 800, alto: 600, escala: 1, desplazamientoX: 100 })
  const centro = recorteCuadrado({ ancho: 800, alto: 600, escala: 1 })
  assert.ok(arrastrada.x < centro.x)
})

// #perfil: la foto entra completa (contain): la base encuadra la dimensión más
// larga y el recorte queda centrado sobre la imagen, sin zoom automático.
test('la escala de ajuste encuadra la foto entera', () => {
  assert.equal(escalaAjuste({ ancho: 600, alto: 1200, lado: 240 }), 0.2, 'vertical: manda el alto')
  assert.equal(escalaAjuste({ ancho: 1200, alto: 600, lado: 240 }), 0.2, 'horizontal: manda el ancho')
  assert.equal(escalaAjuste({ ancho: 800, alto: 800, lado: 240 }), 0.3, 'cuadrada')
  assert.equal(escalaAjuste({ ancho: 100, alto: 200, lado: 240 }), 1.2, 'chica: se agranda para entrar')
  assert.equal(escalaAjuste({}), 1, 'sin datos no rompe')
  assert.equal(escalaAjuste({ ancho: 0, alto: 1200 }), 1, 'dimensiones inválidas')
})

test('con la escala de ajuste el cuadrado sale centrado y entero', () => {
  const vertical = recorteCuadrado({ ancho: 600, alto: 1200, escala: escalaAjuste({ ancho: 600, alto: 1200 }), lado: 240 })
  assert.deepEqual(vertical, { x: 0, y: 300, lado: 600 }, 'vertical: todo el ancho, centro vertical')
  const horizontal = recorteCuadrado({ ancho: 1200, alto: 600, escala: escalaAjuste({ ancho: 1200, alto: 600 }), lado: 240 })
  assert.deepEqual(horizontal, { x: 300, y: 0, lado: 600 }, 'horizontal: todo el alto, centro horizontal')
})

test('el zoom del usuario achica el recorte sobre la base', () => {
  const base = escalaAjuste({ ancho: 600, alto: 1200 })
  const alAbrir = recorteCuadrado({ ancho: 600, alto: 1200, escala: base, lado: 240 })
  const alMaximo = recorteCuadrado({ ancho: 600, alto: 1200, escala: base * 3, lado: 240 })
  assert.equal(alAbrir.lado, 600, 'al abrir entra todo el ancho')
  assert.equal(Math.round(alMaximo.lado), 400, 'a 3× el recorte baja a 400 px de origen')
  assert.equal(Math.round(alMaximo.y), 400, 'sigue centrado')
})
