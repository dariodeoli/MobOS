import assert from 'node:assert/strict'
import test from 'node:test'
import { CLAVES_FIN, ESTADOS_CONCILIACION, MONEDAS_DE_GASTO, cuentaDeGastoValida, filtrosConciliacionValidos, rangoDePreset } from './finUltimoUsado.js'

// #209 en Finanzas: validaciones de lo recordado (Gastos, Conciliación y rango).

test('las claves van con el namespace del dominio fin', () => {
  assert.deepEqual(Object.values(CLAVES_FIN), [
    'fin:rango',
    'fin:gastos-tipo',
    'fin:gastos-moneda',
    'fin:gastos-cuenta',
    'fin:conciliacion-cuenta',
    'fin:conciliacion-medio',
    'fin:conciliacion-procesadora',
    'fin:conciliacion-estado',
  ])
  assert.deepEqual(MONEDAS_DE_GASTO, ['PYG', 'USD', 'BRL', 'EUR', 'USDT'])
  assert.deepEqual(ESTADOS_CONCILIACION, ['PENDING', 'VERIFIED', 'REJECTED'])
})

test('rangoDePreset usa el preset recordado o el default de la pantalla', () => {
  const PRESETS = [
    { id: 'hoy', label: 'Hoy', calc: () => ({ desde: '2026-09-21', hasta: '2026-09-21' }) },
    { id: '30d', label: '30 días', calc: () => ({ desde: '2026-08-23', hasta: '2026-09-21' }) },
  ]
  const porDefecto = () => ({ ...PRESETS[0].calc(), preset: 'hoy' })
  assert.deepEqual(rangoDePreset(PRESETS, '30d', porDefecto), { desde: '2026-08-23', hasta: '2026-09-21', preset: '30d' })
  assert.deepEqual(rangoDePreset(PRESETS, 'no-existe', porDefecto), { desde: '2026-09-21', hasta: '2026-09-21', preset: 'hoy' })
})

test('la cuenta recordada vale solo si existe, está activa y es de la moneda', () => {
  const cuentas = [
    { id: 'a1', isActive: true, currency: 'PYG' },
    { id: 'a2', isActive: false, currency: 'PYG' },
    { id: 'a3', isActive: true, currency: 'USD' },
  ]
  assert.equal(cuentaDeGastoValida('a1', cuentas, 'PYG'), true)
  assert.equal(cuentaDeGastoValida('a2', cuentas, 'PYG'), false, 'inactiva no vale')
  assert.equal(cuentaDeGastoValida('a3', cuentas, 'PYG'), false, 'otra moneda no vale')
  assert.equal(cuentaDeGastoValida('a4', cuentas, 'PYG'), false, 'inexistente no vale')
  assert.equal(cuentaDeGastoValida('', cuentas, 'PYG'), false)
})

test('los filtros de conciliación se sueltan cuando la opción ya no existe', () => {
  const facetas = {
    porCuenta: [{ key: 'cta-1' }],
    porMedio: [{ key: 'CARD' }],
    porProcesadora: [{ key: 'Bancard' }],
  }
  const validos = filtrosConciliacionValidos({ accountId: 'cta-1', method: 'CARD', processor: 'Bancard' }, 'VERIFIED', facetas)
  assert.deepEqual(validos, { filtros: { accountId: 'cta-1', method: 'CARD', processor: 'Bancard' }, estado: 'VERIFIED' })

  const viejos = filtrosConciliacionValidos({ accountId: 'cta-vieja', method: 'PIX', processor: 'Dinelco' }, 'RARO', facetas)
  assert.deepEqual(viejos, { filtros: { accountId: '', method: '', processor: '' }, estado: '' })
})

test('sin facetas (período vacío) los filtros recordados no se aplican', () => {
  assert.deepEqual(filtrosConciliacionValidos({ accountId: 'cta-1', method: 'CARD' }, 'PENDING', {}), {
    filtros: { accountId: '', method: '', processor: '' },
    estado: 'PENDING',
  })
})
