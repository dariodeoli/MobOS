import assert from 'node:assert/strict'
import test from 'node:test'
import { CAMPOS_VISIBLES_CUENTA, CUENTAS_DEMO } from './demoCuentasCobro.js'

// #190: la demo muestra el sistema nuevo completo y sin la palabra «demo» en
// los datos visibles (los ids internos `demo-*` no se muestran).

test('la demo incluye todos los medios del sistema nuevo', () => {
  const medios = new Set(CUENTAS_DEMO.map((cuenta) => cuenta.kind))
  for (const medio of ['CASH', 'TRANSFER', 'CARD', 'PIX', 'CRYPTO', 'TRADE_IN']) {
    assert.ok(medios.has(medio), `falta el medio ${medio}`)
  }
  // Cada medio nuevo con su dato característico.
  assert.match(CUENTAS_DEMO.find((cuenta) => cuenta.kind === 'PIX').pixKey, /@/)
  assert.ok(CUENTAS_DEMO.find((cuenta) => cuenta.kind === 'CRYPTO').reference)
  assert.ok(CUENTAS_DEMO.find((cuenta) => cuenta.kind === 'TRADE_IN').reference)
  // Tarjetas con procesadora y comisión (sistema nuevo).
  for (const tarjeta of CUENTAS_DEMO.filter((cuenta) => cuenta.kind === 'CARD')) {
    assert.ok(tarjeta.processor, `la tarjeta ${tarjeta.name} no tiene procesadora`)
    assert.ok(Number(tarjeta.feePercent) > 0, `la tarjeta ${tarjeta.name} no tiene comisión`)
  }
})

test('los campos visibles no dicen «demo» y los ids quedan internos', () => {
  for (const cuenta of CUENTAS_DEMO) {
    for (const campo of CAMPOS_VISIBLES_CUENTA) {
      const valor = cuenta[campo]
      if (typeof valor === 'string') {
        assert.doesNotMatch(valor, /demo/i, `${cuenta.id}.${campo} muestra «demo»: ${valor}`)
      }
    }
    assert.match(cuenta.id, /^demo-/, 'el id interno conserva el prefijo de la demo')
  }
})

test('las transferencias y el efectivo tienen datos completos', () => {
  for (const transferencia of CUENTAS_DEMO.filter((cuenta) => cuenta.kind === 'TRANSFER')) {
    for (const campo of ['bank', 'holder', 'accountNumber']) {
      assert.ok(transferencia[campo], `la transferencia ${transferencia.name} no tiene ${campo}`)
    }
  }
  const cajas = CUENTAS_DEMO.filter((cuenta) => cuenta.kind === 'CASH')
  assert.deepEqual(cajas.map((cuenta) => cuenta.currency).sort(), ['PYG', 'USD'], 'la caja cubre guaraníes y dólares')
})
