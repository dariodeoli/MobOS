import assert from 'node:assert/strict'
import test from 'node:test'
import { BLOQUES_TICKET_PRUEBA } from './tickets.js'
import { ANCHOS_PRUEBA, BLOQUES_PRUEBA, COPIAS_MAX, CORTES_PRUEBA, bloquesDeTipo, crearMemoriaPlantilla, normalizarPlantilla, plantillaDeImpresora, tipoDePlantilla } from './plantillaPrueba.js'

const memoriaFalsa = () => {
  const datos = new Map()
  return {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
  }
}

test('la plantilla por defecto copia la configuración de la impresora', () => {
  assert.deepEqual(plantillaDeImpresora({ ancho: 58, corte: false, copias: 2 }), {
    tipo: 'breve',
    incluye: { encabezado: true, validacion: true, trazabilidad: true, codigos: true, acentos: true, fecha: false },
    ancho: 58,
    corte: 'ninguno',
    copias: 2,
  })
  assert.equal(plantillaDeImpresora({}).ancho, 80)
  assert.equal(plantillaDeImpresora({}).tipo, 'breve', 'el ticket corto es el predeterminado (#277)')
  assert.equal(plantillaDeImpresora({ corte: true }).corte, 'completo')
})

test('el tipo elegido se valida contra los tipos del builder y el corto es el fallback', () => {
  assert.equal(tipoDePlantilla('venta'), 'venta')
  assert.equal(tipoDePlantilla('breve'), 'breve')
  assert.equal(tipoDePlantilla('inventado'), 'breve')
  assert.equal(tipoDePlantilla(''), 'breve')
  assert.equal(tipoDePlantilla(undefined), 'breve')
  assert.deepEqual(bloquesDeTipo('breve'), ['encabezado', 'validacion', 'fecha'])
  assert.equal(bloquesDeTipo('venta').length, BLOQUES_PRUEBA.length, 'el completo admite todos los bloques')
})

test('normalizar corrige valores rotos y no inventa bloques', () => {
  const plantilla = normalizarPlantilla({ ancho: 55, corte: 'inventado', copias: 99, tipo: 'inventado', incluye: { codigos: false, otro: true } }, {})
  assert.equal(plantilla.ancho, 80)
  assert.equal(plantilla.corte, 'completo')
  assert.equal(plantilla.copias, COPIAS_MAX)
  assert.equal(plantilla.tipo, 'breve', 'un tipo desconocido cae al corto')
  assert.equal(plantilla.incluye.codigos, false)
  assert.equal(plantilla.incluye.encabezado, true)
  assert.equal(plantilla.incluye.fecha, false, 'la fecha arranca apagada')
  assert.equal('otro' in plantilla.incluye, false)
})

test('los ids de bloques, cortes y anchos no se desincronizan del builder', () => {
  assert.deepEqual(BLOQUES_PRUEBA.map(({ id }) => id), [...BLOQUES_TICKET_PRUEBA])
  assert.deepEqual(CORTES_PRUEBA.map(({ id }) => id), ['completo', 'parcial', 'avanza-completo', 'avanza-parcial', 'ninguno'])
  assert.deepEqual([...ANCHOS_PRUEBA], [58, 80])
})

test('la memoria recuerda la plantilla por impresora y se puede olvidar', () => {
  const memoria = crearMemoriaPlantilla(memoriaFalsa())
  assert.equal(memoria.de('p1'), null)
  memoria.recordar('p1', { ancho: 58, corte: 'parcial', copias: 3, tipo: 'venta', incluye: { acentos: false } })
  const guardada = memoria.de('p1')
  assert.equal(guardada.ancho, 58)
  assert.equal(guardada.corte, 'parcial')
  assert.equal(guardada.copias, 3)
  assert.equal(guardada.tipo, 'venta', 'el último tipo usado se recuerda')
  assert.equal(guardada.incluye.acentos, false)
  assert.equal(guardada.incluye.encabezado, true)
  assert.equal(memoria.de('p2'), null)
  memoria.olvidar('p1')
  assert.equal(memoria.de('p1'), null)
})

test('sin almacenamiento la memoria no rompe', () => {
  const memoria = crearMemoriaPlantilla(null)
  assert.equal(memoria.de('p1'), null)
  memoria.recordar('p1', { ancho: 58 })
  assert.equal(memoria.de('p1'), null)
  memoria.olvidar('p1')
})
