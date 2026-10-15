import test from 'node:test'
import assert from 'node:assert/strict'
import { accountPayment, updateAccountPayment, pagosSinVuelto } from './pagoCuenta.js'
import { getDemoCashExpectedByCurrency, getDemoCashExpected } from '../lib/demoCash.js'
import { construirDemoAuditoriaEfectivo } from '../lib/demoAuditoria.js'

const CUENTAS = [
  { id: 'usd', name: 'Cuenta USD', currency: 'USD', kind: 'CASH', isActive: true },
  { id: 'pyg', name: 'Caja', currency: 'PYG', kind: 'CASH', isActive: true },
]

test('vuelto USD (#455): al servidor viaja lo aplicado y también la entrega real en dólares', () => {
  const usd = updateAccountPayment({ accountId: 'usd', originalAmount: '150', exchangeRatePyg: '7300' }, {}, CUENTAS)
  const enviados = pagosSinVuelto([usd], CUENTAS, 1000000)
  const pago = accountPayment(enviados[0], CUENTAS)
  assert.equal(pago.tenderedAmount, '150')
  assert.equal(pago.originalAmount, 136.98)
  // El residuo en Gs es efectivo justo: no lleva entrega.
  assert.equal('tenderedAmount' in accountPayment(enviados[1], CUENTAS), false)
})

test('vuelto en guaraníes (#455): lo recibido del teclado viaja como entrega solo si coincide con el monto cobrado', () => {
  const fila = { accountId: 'pyg', originalAmount: '1000000', monto: '1000000', recibido: 1200000, montoRecibido: 1000000 }
  assert.equal(accountPayment(fila, CUENTAS).tenderedAmount, '1200000')
  assert.equal('tenderedAmount' in accountPayment({ ...fila, monto: '900000', originalAmount: '900000' }, CUENTAS), false, 'si cambió el monto, el recibido ya no vale')
  assert.equal('tenderedAmount' in accountPayment({ accountId: 'pyg', originalAmount: '500000', monto: '500000' }, CUENTAS), false)
})

const ahora = new Date().toISOString()
const caja = { openedAt: new Date(Date.now() - 3600000).toISOString(), openingPyg: 500000, movements: [] }
const ventaConVuelto = {
  vendedorId: 'demo-user',
  pagos: [
    { id: 'p1', medioPago: 'Cuenta USD', method: 'CASH', currency: 'USD', originalAmount: 136.98, tenderedAmount: '150', exchangeRatePyg: 7300, monto: 999954, fecha: ahora, status: 'CONFIRMED' },
    { id: 'p2', medioPago: 'Caja', method: 'CASH', currency: 'PYG', monto: 46, fecha: ahora, status: 'CONFIRMED' },
  ],
}

test('demo (#455): esperado por moneda = USD +150 y Gs con el vuelto descontado, con la misma fórmula', () => {
  const porMoneda = getDemoCashExpectedByCurrency(caja, new Date(), [ventaConVuelto])
  assert.equal(porMoneda.USD, 150)
  // 500.000 + 46 (residuo) − vuelto (150 × 7300 − 999.954 = 95.046) = 405.000
  assert.equal(porMoneda.PYG, 405000)
  assert.equal(getDemoCashExpected(caja, new Date(), [ventaConVuelto]), 405000)
})

test('demo (#455): la auditoría de efectivo muestra el vuelto como egreso y el esperado por moneda coincide con Caja', () => {
  const auditoria = construirDemoAuditoriaEfectivo({ ventas: [ventaConVuelto], cash: caja })
  const vuelto = auditoria.operaciones.find((operacion) => operacion.id === 'vuelto-p1')
  assert.equal(vuelto.direction, 'OUT')
  assert.equal(vuelto.montoPyg, 95046)
  assert.equal(auditoria.resumen.esperadoPorMoneda.USD, 150)
  assert.equal(auditoria.resumen.esperadoPyg, 405000)
})
