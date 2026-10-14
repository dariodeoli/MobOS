import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  abreviar,
  escalaLinda,
  fechasDeRango,
  nombreMedio,
  rutaSector,
  serieContinua,
  sumarPorFecha,
  tendenciaDiaria,
  unidadesDeVenta,
  variacionPct,
  ventanaDias,
} from './datos.js'

test('ventanaDias devuelve la ventana y la anterior contigua del mismo largo', () => {
  const v = ventanaDias('2026-10-14', 14)
  assert.deepEqual(v.actual, { desde: '2026-10-01', hasta: '2026-10-14' })
  assert.deepEqual(v.anterior, { desde: '2026-09-17', hasta: '2026-09-30' })
  assert.equal(fechasDeRango(v.actual.desde, v.actual.hasta).length, 14)
})

test('serieContinua rellena con 0 los días sin ventas y no inventa montos', () => {
  const serie = serieContinua({ desde: '2026-10-01', hasta: '2026-10-04' }, { '2026-10-02': 1500000 })
  assert.deepEqual(serie.map((p) => p.valor), [0, 1500000, 0, 0])
})

test('tendenciaDiaria suma ventas, cobrado, unidades, ticket y ganancia por día', () => {
  const ventas = [
    { fecha: '2026-10-01', precio: 1000000, estadoPago: 'Pagado', productoId: 'a', items: [{ quantity: 2 }] },
    { fecha: '2026-10-01', precio: 500000, estadoPago: 'Pendiente', productoId: 'a' },
    { fecha: '2026-09-30', precio: 999, productoId: 'a' },
  ]
  const t = tendenciaDiaria({ ventas, gastos: [{ fecha: '2026-10-01', monto: 100000 }], prods: { a: { precioCosto: 200000 } } }, { desde: '2026-10-01', hasta: '2026-10-02' })
  assert.deepEqual(t.total.map((p) => p.valor), [1500000, 0])
  assert.deepEqual(t.cobrado.map((p) => p.valor), [1000000, 0])
  assert.deepEqual(t.pendiente.map((p) => p.valor), [500000, 0])
  assert.deepEqual(t.unidades.map((p) => p.valor), [3, 0])
  assert.deepEqual(t.ticket.map((p) => p.valor), [750000, 0])
  assert.deepEqual(t.ganancia.map((p) => p.valor), [1500000 - 400000 - 100000, 0])
})

test('unidadesDeVenta cuenta líneas y toma 1 para ventas sin detalle', () => {
  assert.equal(unidadesDeVenta({ items: [{ quantity: 2 }, { quantity: 1 }] }), 3)
  assert.equal(unidadesDeVenta({}), 1)
})

test('sumarPorFecha respeta el rango', () => {
  const mapa = sumarPorFecha([{ fecha: '2026-10-01', monto: 5 }, { fecha: '2026-11-01', monto: 9 }], (i) => i.monto, { desde: '2026-10-01', hasta: '2026-10-31' })
  assert.deepEqual(mapa, { '2026-10-01': 5 })
})

test('escalaLinda y abreviar dan marcas legibles', () => {
  const e = escalaLinda(3200000)
  assert.equal(e.ticks[0], 0)
  assert.ok(e.max >= 3200000)
  assert.equal(abreviar(1500000), '1,5 M')
  assert.equal(abreviar(250000), '250 mil')
})

test('nombreMedio muestra nombres, no solo siglas', () => {
  assert.equal(nombreMedio('DINERO'), 'Efectivo')
  assert.equal(nombreMedio('UENO BANK'), 'Ueno Bank')
  assert.equal(nombreMedio('POS UENO'), 'POS Ueno')
  assert.equal(nombreMedio('—'), 'Sin medio')
})

test('variacionPct no inventa porcentaje sin base', () => {
  assert.equal(variacionPct(10, 0), null)
  assert.equal(variacionPct(150, 100), 50)
})

test('rutaSector cierra el círculo completo sin romper el arco', () => {
  assert.match(rutaSector(50, 50, 40, 25, 0, Math.PI * 2), /^M/)
})
