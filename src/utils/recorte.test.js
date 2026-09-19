import assert from 'node:assert/strict'
import test from 'node:test'
import { recorteCuadrado } from './recorte.js'

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
