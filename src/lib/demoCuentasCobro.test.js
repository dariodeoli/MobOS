import assert from 'node:assert/strict'
import test from 'node:test'
import { CAMPOS_VISIBLES_CUENTA, CUENTAS_DEMO, migrarCuentasDemoV2 } from './demoCuentasCobro.js'

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

test('la demo cubre titular dueño, moneda alternativa y cuenta histórica inactiva', () => {
  const owner = CUENTAS_DEMO.find((cuenta) => cuenta.id === 'demo-transfer-gnb-owner')
  assert.equal(owner.holder, 'Hernán Acosta')
  assert.equal(owner.currency, 'USD')
  assert.equal(owner.accountNumber, '003-4567890')
  const historical = CUENTAS_DEMO.find((cuenta) => cuenta.id === 'demo-transfer-sudameris-legacy')
  assert.equal(historical.isActive, false)
  assert.match(historical.reference, /histórica/i)
})

test('la migración v2 conserva ediciones, cuentas propias y bajas sin duplicar', () => {
  const anteriores = [
    { id: 'demo-transfer-itau', name: 'Itaú personalizado', kind: 'TRANSFER', currency: 'PYG', bank: 'Itaú', holder: 'Titular editado', accountNumber: '001-2456789', isActive: true },
    { id: 'demo-custom-account', name: 'Cuenta propia', kind: 'CASH', currency: 'PYG', isActive: true },
    { id: 'demo-transfer-continental', name: 'Continental desactivada', kind: 'TRANSFER', currency: 'PYG', bank: 'Continental', holder: 'Aurora Móviles', accountNumber: '002-9876543', isActive: false },
  ]
  const migradas = migrarCuentasDemoV2(anteriores)
  assert.equal(migradas.filter(cuenta => cuenta.id === 'demo-transfer-itau').length, 1)
  assert.equal(migradas.find(cuenta => cuenta.id === 'demo-transfer-itau').holder, 'Titular editado')
  assert.equal(migradas.find(cuenta => cuenta.id === 'demo-custom-account').name, 'Cuenta propia')
  assert.equal(migradas.find(cuenta => cuenta.id === 'demo-transfer-continental').isActive, false)
  assert.equal(migradas.filter(cuenta => cuenta.id === 'demo-transfer-gnb-owner').length, 1)
  assert.equal(migradas.filter(cuenta => cuenta.id === 'demo-transfer-sudameris-legacy').length, 1)
})
