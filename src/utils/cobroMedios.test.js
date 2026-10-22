import test from 'node:test'
import assert from 'node:assert/strict'
import { cuentaDirecta, gruposDeCuentas, montosRapidos, ordenarPorRecientes } from './cobroMedios.js'

const cuentas = [
  { id: 'e1', name: 'Caja Gs', kind: 'CASH', currency: 'PYG', isActive: true },
  { id: 'e2', name: 'Caja US$', kind: 'CASH', currency: 'USD', isActive: true },
  { id: 't1', name: 'Itaú', kind: 'TRANSFER', currency: 'PYG', isActive: true },
  { id: 't2', name: 'Ueno', kind: 'TRANSFER', currency: 'PYG', isActive: true },
  { id: 't3', name: 'Vieja', kind: 'TRANSFER', currency: 'PYG', isActive: false },
  { id: 'c1', name: 'POS', kind: 'CARD', currency: 'PYG', isActive: true },
]

test('agrupa por medio, solo cuentas activas, y respeta el orden de los medios', () => {
  const grupos = gruposDeCuentas(cuentas)
  assert.deepEqual(grupos.map(g => g.id), ['CASH', 'CASH-USD', 'TRANSFER', 'CARD'])
  assert.deepEqual(grupos[2].cuentas.map(c => c.id), ['t1', 't2'])
  assert.equal(grupos[1].label, 'Efectivo US$')
})

test('las cuentas recientes van primero', () => {
  assert.deepEqual(ordenarPorRecientes(cuentas.slice(2, 4), ['t2']).map(c => c.id), ['t2', 't1'])
})

test('una sola cuenta se elige sola; varias transferencias se preguntan', () => {
  const [efectivo, efectivoUsd, transferencia, tarjeta] = gruposDeCuentas(cuentas)
  assert.equal(cuentaDirecta(efectivo).id, 'e1')
  assert.equal(cuentaDirecta(efectivoUsd).id, 'e2')
  assert.equal(cuentaDirecta(transferencia), null)
  assert.equal(cuentaDirecta(tarjeta).id, 'c1')
})

test('montos rápidos: saldo, mitad y redondeos de lo recibido en efectivo', () => {
  const chips = montosRapidos({ efectivoGs: true, disponible: 1_230_000, monto: 1_230_000 })
  assert.deepEqual(chips.filter(c => c.tipo === 'monto').map(c => c.valor), [1_230_000, 615_000])
  assert.deepEqual(chips.filter(c => c.tipo === 'recibido').map(c => c.valor), [1_230_000, 1_250_000, 1_300_000, 1_500_000])
  assert.deepEqual(montosRapidos({ disponible: 0 }), [])
  assert.deepEqual(montosRapidos({ disponible: 1 }).map(c => c.etiqueta), ['Saldo'])
})
