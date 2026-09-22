import assert from 'node:assert/strict'
import { mencionadosEn, variantesDeNombre } from '../lib/menciones'

// La detección de menciones del backend tiene que coincidir con la de la UI
// (src/utils/menciones.js): sin acentos, con límites de palabra y aceptando
// nombre completo o solo el primero.
const EQUIPO = ['Ana Gómez', 'Beto', 'María José']

assert.deepEqual(mencionadosEn('@Ana Gómez pasá el pedido', EQUIPO), ['Ana Gómez'])
assert.deepEqual(mencionadosEn('@maria jose revisá esto', EQUIPO), ['María José'])
assert.deepEqual(mencionadosEn('sin menciones', EQUIPO), [])

// Límites: @anabel no menciona a Ana y un correo tampoco.
assert.deepEqual(mencionadosEn('@anabel contestó', EQUIPO), [])
assert.deepEqual(mencionadosEn('escribí a a@ana gomez.com', EQUIPO), [])
// Acento de un lado u otro.
assert.deepEqual(mencionadosEn('@José revisá', ['Jose']), ['Jose'])
assert.deepEqual(mencionadosEn('@Jose revisá', ['José']), ['José'])

// Variantes de nombre: completo, primero y último (descartando cortos).
assert.deepEqual(variantesDeNombre('Ana Gómez'), ['Ana Gómez', 'Ana', 'Gómez'])
assert.deepEqual(variantesDeNombre('Beto'), ['Beto'])
assert.deepEqual(variantesDeNombre('Al Pe'), ['Al Pe'])
assert.deepEqual(variantesDeNombre('Al'), [])
assert.deepEqual(variantesDeNombre(''), [])

console.log('menciones.test.ts: ok')
