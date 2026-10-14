import test from 'node:test'
import assert from 'node:assert/strict'
import { entregaCobraEnvio, montoEnvioEfectivo, pagaAlRecibirVigente } from './cobroPos.js'

test('el envío solo suma con Delivery o Encomienda (#390)', () => {
  assert.equal(montoEnvioEfectivo('Delivery', '30000'), 30000)
  assert.equal(montoEnvioEfectivo('Encomienda', 15000), 15000)
  for (const tipo of ['Retiro en tienda', 'Retiro en otra sucursal', 'Envío entre sucursales', undefined])
    assert.equal(montoEnvioEfectivo(tipo, '30000'), 0, String(tipo))
  assert.equal(entregaCobraEnvio('Delivery'), true)
})

test('«Paga al recibir» nunca oculta pagos cargados (#390)', () => {
  assert.equal(pagaAlRecibirVigente(true, []), true)
  assert.equal(pagaAlRecibirVigente(true, [{ accountId: 'x' }]), false)
  assert.equal(pagaAlRecibirVigente(false, []), false)
})
