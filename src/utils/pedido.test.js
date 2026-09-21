import test from 'node:test'
import assert from 'node:assert/strict'
import { codigoPedido, fechaCompacta } from './pedido.js'

test('muestra los códigos PREFIX-#NNNN con el guion y padding a 4 dígitos', () => {
  assert.equal(codigoPedido('MOB-#0001'), 'MOB-#0001')
  assert.equal(codigoPedido('MOB #1'), 'MOB-#0001')
  assert.equal(codigoPedido('ABC-#12'), 'ABC-#0012')
  assert.equal(codigoPedido('TST-#0007'), 'TST-#0007')
  assert.equal(codigoPedido('MOB-0001'), 'MOB-#0001')
})

test('deja tal cual los formatos que no son PREFIX-#NNNN y normaliza los viejos', () => {
  assert.equal(codigoPedido('E2E-SEED-001'), 'E2E-SEED-001')
  // Los códigos viejos con prefijo y número se muestran con el formato nuevo
  // (la migración los normaliza en la base).
  assert.equal(codigoPedido('KO #31754'), 'KO-#31754')
})

test('la fecha del listado es compacta: "17 sep · 15:30" en 24 h', () => {
  assert.equal(fechaCompacta('2026-09-17T15:30:00'), '17 sep · 15:30')
  assert.equal(fechaCompacta('2026-01-02T09:05:00'), '02 ene · 09:05')
  assert.equal(fechaCompacta('2026-12-31T23:59:00'), '31 dic · 23:59')
})

test('sin fecha válida la celda no rompe la grilla', () => {
  assert.equal(fechaCompacta(''), 'Sin fecha')
  assert.equal(fechaCompacta(null), 'Sin fecha')
  assert.equal(fechaCompacta('no-es-fecha'), 'Sin fecha')
})
