// Plantilla del ticket de prueba (#277): la forma canónica vive en la
// biblioteca (owncoding-ui) y la app la adapta con la configuración de la
// impresora y la memoria local. Acá se verifica el adaptador.
import assert from 'node:assert/strict'
import test from 'node:test'
import { ANCHOS_PRUEBA, CORTES_PRUEBA, TIPO_PRUEBA_POR_DEFECTO, crearMemoriaPlantilla, normalizarPlantilla, plantillaDeImpresora } from './plantillaPrueba.js'

const memoriaFalsa = () => {
  const datos = new Map()
  return {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
  }
}

test('la plantilla por defecto es el ticket corto con la configuración de la impresora', () => {
  assert.deepEqual(plantillaDeImpresora({ ancho: 58, copias: 2 }), {
    tipo: 'corta',
    ancho: 58,
    incluyeFecha: false,
    corte: 'completo',
    copias: 2,
  })
  assert.equal(plantillaDeImpresora({}).ancho, 80)
  assert.equal(plantillaDeImpresora({}).tipo, 'corta', 'el ticket corto es el predeterminado (#277)')
  assert.equal(TIPO_PRUEBA_POR_DEFECTO, 'corta')
})

test('normalizar corrige valores rotos y descarta lo que no es del contrato', () => {
  const plantilla = normalizarPlantilla({ ancho: 55, corte: 'inventado', copias: 99, tipo: 'inventado', incluyeFecha: 'sí', incluye: { codigos: false, otro: true } }, {})
  assert.equal(plantilla.ancho, 80)
  assert.equal(plantilla.corte, 'completo')
  assert.equal(plantilla.copias, 1, 'las copias fuera de rango vuelven al valor por defecto')
  assert.equal(plantilla.tipo, 'corta', 'un tipo desconocido cae al corto')
  assert.equal(plantilla.incluyeFecha, true)
  assert.equal('incluye' in plantilla, false, 'el contrato de la biblioteca no tiene bloques')
  const base = normalizarPlantilla({}, { ancho: 58, copias: 3 })
  assert.deepEqual(base, { tipo: 'corta', ancho: 58, incluyeFecha: false, corte: 'completo', copias: 3 })
})

test('los cortes y anchos son los de la biblioteca', () => {
  assert.deepEqual(CORTES_PRUEBA.map(({ id }) => id), ['completo', 'parcial', 'avanza-completo', 'avanza-parcial'])
  assert.ok(CORTES_PRUEBA.every(({ etiqueta }) => Boolean(etiqueta)))
  assert.deepEqual([...ANCHOS_PRUEBA], [58, 80])
})

test('la memoria recuerda la plantilla por impresora y se puede olvidar', () => {
  const memoria = crearMemoriaPlantilla(memoriaFalsa())
  assert.equal(memoria.de('p1'), null)
  memoria.recordar('p1', { ancho: 58, corte: 'parcial', copias: 3, tipo: 'completa', incluyeFecha: true })
  const guardada = memoria.de('p1')
  assert.equal(guardada.ancho, 58)
  assert.equal(guardada.corte, 'parcial')
  assert.equal(guardada.copias, 3)
  assert.equal(guardada.tipo, 'completa', 'el último tipo usado se recuerda')
  assert.equal(guardada.incluyeFecha, true)
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
