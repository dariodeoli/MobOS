import test from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaCotizacion, etiquetaOrigen, horaAsuncion, origenAutomatico, origenManual, origenParaServidor } from './cotizacion.js'
import { accountPayment, cambiarCuentaPago, updateAccountPayment } from './pagoCuenta.js'

const CUENTAS = [{ id: 'usd', name: 'Cuenta USD', currency: 'USD', kind: 'CASH', isActive: true }]
const INFO = { rate: 5710, source: 'cambioschaco', sourceLabel: 'Cambios Chaco', side: 'venta', updatedAt: '2026-10-14T17:05:00.000Z', stale: false }

test('la etiqueta muestra casa, lado y hora de Asunción (#401)', () => {
  assert.equal(horaAsuncion('2026-10-14T17:05:00.000Z'), '14:05')
  assert.equal(etiquetaCotizacion(INFO), 'Cambios Chaco · venta · 14:05')
})

test('un valor servido desde el último conocido se marca desactualizada', () => {
  assert.equal(etiquetaCotizacion({ ...INFO, stale: true }), 'Cambios Chaco · venta · 14:05 · desactualizada')
})

test('sin hora ni nombre de casa la etiqueta no deja separadores sueltos', () => {
  assert.equal(etiquetaCotizacion({ source: 'bcp', side: 'compra', updatedAt: null, fetchedAt: null }), 'bcp · compra')
  assert.equal(etiquetaCotizacion(null), '')
  assert.equal(horaAsuncion('no es fecha'), '')
})

test('una cotización manual lleva quién y cuándo', () => {
  const origen = origenManual('Ana', new Date('2026-10-14T17:05:00.000Z'))
  assert.deepEqual(origen, { manual: true, by: 'Ana', at: '2026-10-14T17:05:00.000Z' })
  assert.equal(etiquetaOrigen(origen), 'Manual · Ana · 14:05')
  assert.equal(etiquetaOrigen(origenManual('', new Date('2026-10-14T17:05:00.000Z'))), 'Manual · 14:05')
})

test('al servidor viaja solo el origen informativo, sin nombres', () => {
  assert.deepEqual(origenParaServidor(origenManual('Ana', new Date('2026-10-14T17:05:00.000Z'))), { manual: true, at: '2026-10-14T17:05:00.000Z' })
  assert.deepEqual(origenParaServidor(origenAutomatico(INFO)), { manual: false, source: 'cambioschaco', side: 'venta', at: '2026-10-14T17:05:00.000Z' })
  assert.equal(origenParaServidor(null), undefined)
})

test('la cotización automática nunca pisa una marcada como manual, ni siquiera tras vaciar el monto', () => {
  const manual = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7500', rateOrigin: origenManual('Ana') }
  assert.equal(updateAccountPayment(manual, { exchangeRatePyg: '5710', automatico: true, rateOrigin: origenAutomatico(INFO) }, CUENTAS), manual)
  const vacio = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '' }
  const auto = updateAccountPayment(vacio, { exchangeRatePyg: '5710', automatico: true, rateOrigin: origenAutomatico(INFO) }, CUENTAS)
  assert.equal(auto.exchangeRatePyg, '5710')
  assert.equal(auto.rateOrigin.manual, false)
})

test('el pago de una cuenta USD envía el origen y uno en PYG no', () => {
  const pago = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '5710', rateOrigin: origenAutomatico(INFO) }
  const out = accountPayment(pago, CUENTAS)
  assert.equal(out.amountPyg, 57100)
  assert.deepEqual(out.exchangeRateOrigin, { manual: false, source: 'cambioschaco', side: 'venta', at: '2026-10-14T17:05:00.000Z' })
  assert.equal('exchangeRateOrigin' in accountPayment({ accountId: 'usd', originalAmount: '10', exchangeRatePyg: '5710' }, CUENTAS), false)
})

test('cambiar a una cuenta de otra moneda descarta cotización y origen', () => {
  const cuentas = [...CUENTAS, { id: 'pyg', name: 'Caja', currency: 'PYG', kind: 'CASH', isActive: true }]
  const { cambio } = cambiarCuentaPago({ accountId: 'usd', originalAmount: '10', exchangeRatePyg: '5710', rateOrigin: origenManual('Ana') }, cuentas, 'pyg', 0)
  assert.equal(cambio.exchangeRatePyg, '')
  assert.ok('rateOrigin' in cambio && cambio.rateOrigin === undefined)
})
