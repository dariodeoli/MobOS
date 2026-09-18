import assert from 'node:assert/strict'
import { acumularSegundos, estaEnLinea, normalizarAlcance, VENTANA_EN_LINEA_MS } from '../lib/presence'

const ahora = new Date('2026-09-17T15:00:00.000Z')
const hace = (ms: number) => new Date(ahora.getTime() - ms)

assert.equal(estaEnLinea(hace(VENTANA_EN_LINEA_MS - 1000), ahora), true, 'un latido dentro de la ventana está en línea')
assert.equal(estaEnLinea(hace(VENTANA_EN_LINEA_MS), ahora), true, 'el borde de la ventana sigue contando')
assert.equal(estaEnLinea(hace(VENTANA_EN_LINEA_MS + 1), ahora), false, 'fuera de la ventana ya no está en línea')
assert.equal(estaEnLinea(null, ahora), false, 'sin latidos nunca está en línea')
assert.equal(estaEnLinea('fecha inválida', ahora), false)

assert.equal(acumularSegundos(hace(30_000), true, ahora), 30, 'acumula los segundos entre latidos con actividad')
assert.equal(acumularSegundos(hace(30_000), false, ahora), 0, 'sin actividad no acumula')
assert.equal(acumularSegundos(hace(VENTANA_EN_LINEA_MS + 1), true, ahora), 0, 'un hueco mayor a la ventana no infla el consumo')
assert.equal(acumularSegundos(null, true, ahora), 0, 'el primer latido no acumula')
assert.equal(acumularSegundos(hace(70_000), true, ahora), 60, 'un hueco largo dentro de la ventana se topea en 60 s')

assert.equal(normalizarAlcance('  inventario  '), 'inventario')
assert.equal(normalizarAlcance(''), null)
assert.equal(normalizarAlcance('x'.repeat(120)).length, 60, 'el alcance se recorta a 60 caracteres')

console.log('PASS: reglas puras de presencia (ventana de 75 s, consumo con actividad y alcance)')
