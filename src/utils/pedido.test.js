import test from 'node:test'
import assert from 'node:assert/strict'
import { codigoPedido } from './pedido.js'

test('muestra los códigos PREFIX-#NNNN con padding a 4 dígitos', () => {
  assert.equal(codigoPedido('MOB-#0001'), 'MOB #0001')
  assert.equal(codigoPedido('MOB #1'), 'MOB #0001')
  assert.equal(codigoPedido('ABC-#12'), 'ABC #0012')
  assert.equal(codigoPedido('TST-#0007'), 'TST #0007')
  assert.equal(codigoPedido('MOB-0001'), 'MOB #0001')
})

test('deja tal cual los formatos que no son PREFIX-#NNNN', () => {
  assert.equal(codigoPedido('E2E-SEED-001'), 'E2E-SEED-001')
  assert.equal(codigoPedido('KO #31754'), 'KO #31754')
})
