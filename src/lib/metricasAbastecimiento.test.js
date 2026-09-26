import assert from 'node:assert/strict'
import test from 'node:test'

import { resumenDeCompras, resumenDeRutaCde, tonoPuntualidad } from './metricasAbastecimiento.js'

// Abastecimiento F6 (#250): la lectura FIN de las métricas (costo real por
// proveedor y tiempos de CDE) no depende del render: se fija acá.

test('puntualidad: verde en 90+, naranja en 70+, rojo debajo y gris sin dato', () => {
  assert.equal(tonoPuntualidad(90), 'green')
  assert.equal(tonoPuntualidad(100), 'green')
  assert.equal(tonoPuntualidad(70), 'orange')
  assert.equal(tonoPuntualidad(89), 'orange')
  assert.equal(tonoPuntualidad(69), 'red')
  assert.equal(tonoPuntualidad(0), 'red')
  assert.equal(tonoPuntualidad(null), 'slate')
  assert.equal(tonoPuntualidad(''), 'slate')
})

test('resumen de compras: monto, unidades y costo real por unidad (sin inventar sin unidades)', () => {
  const resumen = resumenDeCompras([
    { costPyg: 1_000_000, unidades: 10 },
    { costPyg: 500_000, unidades: 5 },
    { costPyg: 100_000, unidades: 2 },
  ])
  assert.deepEqual(resumen, { montoPyg: 1_600_000, unidades: 17, costoPromedioUnidadPyg: 94_118 })
  assert.deepEqual(resumenDeCompras([]), { montoPyg: 0, unidades: 0, costoPromedioUnidadPyg: null })
  assert.equal(resumenDeCompras(null).costoPromedioUnidadPyg, null)
})

test('rutas de CDE: promedio ponderado por lotes y puntualidad agregada', () => {
  const resumen = resumenDeRutaCde([
    { origen: 'CDE', destino: 'Asunción', metodo: 'BUS', lotes: 3, diasPromedio: 2, enTiempoPct: 100 },
    { origen: 'CDE', destino: 'Asunción', metodo: 'AEX', lotes: 1, diasPromedio: 4, enTiempoPct: 0 },
    // Otra salida y una ruta sin llegadas no entran en la cuenta.
    { origen: 'USA', destino: 'Asunción', metodo: 'AEX', lotes: 5, diasPromedio: 20, enTiempoPct: 100 },
    { origen: 'CDE', destino: 'Encarnación', metodo: 'BUS', lotes: 2, diasPromedio: null, enTiempoPct: null },
  ])
  assert.deepEqual(resumen, { diasPromedio: 2.5, lotes: 4, enTiempoPct: 75 })
  assert.equal(resumenDeRutaCde([{ origen: 'CDE', destino: 'Asunción', lotes: 1, diasPromedio: null }]), null)
  assert.equal(resumenDeRutaCde([]), null)
})

test('rutas de CDE: sin ETA medida la puntualidad no se inventa', () => {
  const resumen = resumenDeRutaCde([{ origen: 'CDE', destino: 'Asunción', metodo: 'BUS', lotes: 2, diasPromedio: 3, enTiempoPct: null }])
  assert.deepEqual(resumen, { diasPromedio: 3, lotes: 2, enTiempoPct: null })
})
