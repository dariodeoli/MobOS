import assert from 'node:assert/strict'
import test from 'node:test'
import { idPedido, prefijoEfectivo, vistaPreviaNumeros } from './formatoPedido.js'

test('prefijoEfectivo cae en MOB cuando no es válido', () => {
  assert.equal(prefijoEfectivo('ped'), 'PED')
  for (const valor of [undefined, null, '', 'P', 'PEDI', 'P1', '12']) assert.equal(prefijoEfectivo(valor), 'MOB', String(valor))
})

test('idPedido usa el mismo formato que el backend (PREFIJO-#0001)', () => {
  assert.equal(idPedido('PED', 1), 'PED-#0001')
  assert.equal(idPedido('ped', 1001), 'PED-#1001')
  assert.equal(idPedido('', 10000), 'MOB-#10000')
  assert.equal(idPedido('PED', 0), 'PED-#0001')
})

test('vistaPreviaNumeros muestra los próximos tres pedidos', () => {
  assert.equal(vistaPreviaNumeros('PED', 1001), 'PED-#1001, PED-#1002, PED-#1003…')
  assert.equal(vistaPreviaNumeros('', undefined), 'MOB-#0001, MOB-#0002, MOB-#0003…')
})
