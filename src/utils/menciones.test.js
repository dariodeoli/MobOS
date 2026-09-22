import test from 'node:test'
import assert from 'node:assert/strict'
import { mencionadosEn, tramosDeMencion, consultaDeMencion, insertarMencion } from './menciones.js'

const EQUIPO = ['Ana Gómez', 'Beto', 'María José']

test('encuentra los mencionados sin acentos ni mayúsculas', () => {
  assert.deepEqual(mencionadosEn('@Ana Gómez pasá el pedido', EQUIPO), ['Ana Gómez'])
  assert.deepEqual(mencionadosEn('@maria jose revisá esto', EQUIPO), ['María José'])
  assert.deepEqual(mencionadosEn('sin menciones', EQUIPO), [])
})

test('prefiere el nombre más largo cuando hay prefijos', () => {
  const texto = 'hola @Ana Gómez y @Beto'
  assert.deepEqual(mencionadosEn(texto, EQUIPO).sort(), ['Ana Gómez', 'Beto'])
})

test('los tramos marcan solo la mención', () => {
  const tramos = tramosDeMencion('Hola @Beto, fijate', EQUIPO)
  assert.deepEqual(tramos, [
    { texto: 'Hola ', mencion: false },
    { texto: '@Beto', mencion: true },
    { texto: ', fijate', mencion: false },
  ])
  assert.deepEqual(tramosDeMencion('', EQUIPO), [])
  assert.deepEqual(tramosDeMencion('sin equipo', []), [{ texto: 'sin equipo', mencion: false }])
})

test('el autocompletado ofrece lo que se escribe después de la arroba', () => {
  assert.equal(consultaDeMencion('hola @'), '')
  assert.equal(consultaDeMencion('hola @An'), 'An')
  assert.equal(consultaDeMencion('hola @Ana Gomez'), null)
  assert.equal(consultaDeMencion('sin arroba'), null)
})

test('insertarMencion reemplaza la consulta en curso', () => {
  assert.equal(insertarMencion('hola @An', 'Ana Gómez'), 'hola @Ana Gómez ')
  assert.equal(insertarMencion('hola ', 'Beto'), 'hola @Beto ')
  assert.equal(insertarMencion('hola @', 'Beto'), 'hola @Beto ')
})

test('no menciona dentro de otra palabra ni en correos', () => {
  // @anabel no menciona a Ana; un correo a@ana.com tampoco.
  assert.deepEqual(mencionadosEn('@anabel contestó', EQUIPO), [])
  assert.deepEqual(mencionadosEn('escribí a a@ana gomez.com', EQUIPO), [])
  // Con coma o al final del texto, sí.
  assert.deepEqual(mencionadosEn('dale, @Beto', EQUIPO), ['Beto'])
})

test('los tramos reconstruyen el texto y no pintan falsos positivos', () => {
  const texto = 'Hola @Beto, @anabel y @María José!'
  const tramos = tramosDeMencion(texto, EQUIPO)
  assert.equal(tramos.map((tramo) => tramo.texto).join(''), texto)
  const pintados = tramos.filter((tramo) => tramo.mencion).map((tramo) => tramo.texto)
  assert.deepEqual(pintados, ['@Beto', '@María José'])
  // Con acento en el texto y sin acento en el nombre (y viceversa).
  assert.deepEqual(mencionadosEn('@José revisá', ['Jose']), ['Jose'])
  assert.deepEqual(mencionadosEn('@Jose revisá', ['José']), ['José'])
})
