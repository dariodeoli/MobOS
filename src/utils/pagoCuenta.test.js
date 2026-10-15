import test from 'node:test'
import assert from 'node:assert/strict'
import { accountPayment, updateAccountPayment, cambiarCuentaPago, errorCotizacion, avisoDesvioCotizacion, residuoSubCentavo, vueltoEfectivoExtranjero, pagosSinVuelto } from './pagoCuenta.js'
import { convertirAPyg, montoMaximoEnMoneda } from './conversionPyg.js'

const CUENTAS = [
  { id: 'usd', name: 'Cuenta USD', currency: 'USD', kind: 'CASH', isActive: true },
  { id: 'pyg', name: 'Caja', currency: 'PYG', kind: 'CASH', isActive: true },
  { id: 'canje', name: 'Canje', currency: 'PYG', kind: 'TRADE_IN', isActive: true },
]

test('la cotización automática no pisa la que ya cargó el vendedor (#173-A)', () => {
  const conManual = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7500', monto: '75000' }
  const resultado = updateAccountPayment(conManual, { exchangeRatePyg: '5935.01', automatico: true }, CUENTAS)
  assert.equal(resultado, conManual, 'devuelve el mismo pago sin tocar la cotización manual')
  assert.equal(resultado.exchangeRatePyg, '7500')
  assert.equal(resultado.monto, '75000')
  assert.equal('automatico' in resultado, false, 'la marca de automática no queda en el pago')
})

test('la cotización automática completa una fila USD que todavía no la tiene', () => {
  const vacia = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '' }
  const resultado = updateAccountPayment(vacia, { exchangeRatePyg: '5935.01', automatico: true }, CUENTAS)
  assert.equal(resultado.exchangeRatePyg, '5935.01')
  assert.equal(resultado.monto, '59350')
})

test('el equivalente en guaraníes sigue al monto original y a la cotización', () => {
  const base = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7500' }
  const conOtraCotizacion = updateAccountPayment(base, { exchangeRatePyg: '7600' }, CUENTAS)
  assert.equal(conOtraCotizacion.monto, '76000')
  const conOtroMonto = updateAccountPayment(conOtraCotizacion, { originalAmount: '2' }, CUENTAS)
  assert.equal(conOtroMonto.monto, '15200')
})

test('una fila en guaraníes convierte con cotización 1', () => {
  const resultado = updateAccountPayment({ accountId: 'pyg', originalAmount: '25000' }, {}, CUENTAS)
  assert.equal(resultado.exchangeRatePyg, undefined)
  assert.equal(resultado.monto, '25000')
})

test('accountPayment convierte con la cotización de la fila', () => {
  const pago = accountPayment({ accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7500' }, CUENTAS)
  assert.deepEqual(pago, { accountId: 'usd', originalAmount: 10, exchangeRatePyg: 7500, amountPyg: 75000, method: 'CASH', status: 'CONFIRMED' })
})

test('accountPayment rechaza la fila sin cotización o sin cuenta activa', () => {
  assert.throws(
    () => accountPayment({ accountId: 'usd', originalAmount: '10', exchangeRatePyg: '' }, CUENTAS),
    /cotización manual mayor a cero/,
  )
  assert.throws(
    () => accountPayment({ accountId: 'no-existe', originalAmount: '10' }, CUENTAS),
    /cuenta activa/,
  )
})

test('accountPayment exige serial, modelo y condición en el canje', () => {
  assert.throws(
    () => accountPayment({ accountId: 'canje', originalAmount: '50000' }, CUENTAS),
    /serial, modelo y condición/,
  )
  const pago = accountPayment(
    { accountId: 'canje', originalAmount: '50000', tradeIn: { serial: '356789102345678', model: 'iPhone 12', conditionNotes: 'Buen estado' } },
    CUENTAS,
  )
  assert.equal(pago.method, 'TRADE_IN')
  assert.deepEqual(pago.tradeIn, { serial: '356789102345678', model: 'iPhone 12', conditionNotes: 'Buen estado' })
})

test('cambiar de cuenta a otra moneda descarta la cotización anterior (#390)', () => {
  const cuentas = [...CUENTAS, { id: 'brl', name: 'Cuenta BRL', currency: 'BRL', kind: 'CASH', isActive: true }, { id: 'usd2', name: 'USD 2', currency: 'USD', kind: 'CASH', isActive: true }]
  const pagoUsd = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7300' }
  const aBrl = cambiarCuentaPago(pagoUsd, cuentas, 'brl', 100000)
  assert.equal(aBrl.cambio.exchangeRatePyg, '')
  assert.equal(aBrl.cambio.originalAmount, '')
  assert.equal(aBrl.proponerAlLlegarCotizacion, true)
  const aPyg = cambiarCuentaPago(pagoUsd, cuentas, 'pyg', 100000)
  assert.equal(aPyg.cambio.exchangeRatePyg, '')
  assert.equal(aPyg.cambio.originalAmount, '100000')
  // Misma moneda con monto: se conservan monto y cotización.
  const misma = cambiarCuentaPago(pagoUsd, cuentas, 'usd2', 100000)
  assert.equal(misma.cambio.exchangeRatePyg, '7300')
  assert.equal(misma.cambio.originalAmount, '10')
  // Primera elección: propone el saldo en la moneda de la cuenta.
  const primera = cambiarCuentaPago({ accountId: '', originalAmount: '', exchangeRatePyg: '7300' }, cuentas, 'usd', 73000)
  assert.equal(primera.cambio.originalAmount, '10,00')
})

// Referencia independiente (cociente exacto con BigInt y redondeo HALF_UP). El
// cruce contra Prisma.Decimal del servidor vive en backend/tests/conversion-pyg.test.ts.
const referencia = (monto, tasa) => {
  const [mi, mf = ''] = String(monto).split('.')
  const [ti, tf = ''] = String(tasa).split('.')
  const num = BigInt(mi + mf) * BigInt(ti + tf)
  const den = 10n ** BigInt(mf.length + tf.length)
  return Number(num / den + (2n * (num % den) >= den ? 1n : 0n))
}

test('conversión a PYG HALF_UP exacta en 1.000+ combinaciones', () => {
  let n = 0
  const tasas = ['7250', '7300', '7300.5', '7301.46', '7284.25', '5935.01', '1375.5', '7249.99', '19999.99']
  for (let cents = 1; cents <= 20000; cents += 29) {
    const monto = (cents / 100).toFixed(2)
    for (const tasa of tasas) {
      assert.equal(convertirAPyg(monto, tasa), referencia(monto, tasa), `${monto} x ${tasa}`)
      n++
    }
  }
  assert.ok(n >= 721)
  assert.equal(convertirAPyg('2,01', '7250'), 14573, 'caso reportado: el cliente daba 14.572')
})

test('el prefill USD redondea hacia abajo al centavo y nunca supera el saldo', () => {
  assert.equal(montoMaximoEnMoneda(1000000, '7300'), '136,98')
  assert.ok(convertirAPyg('136.98', '7300') <= 1000000)
  assert.ok(convertirAPyg('136.99', '7300') > 1000000, 'el redondeo al más cercano pasaba del total')
  for (let pyg = 1000; pyg < 400000; pyg += 977) {
    for (const tasa of ['7300', '7250', '7301.46']) {
      const m = montoMaximoEnMoneda(pyg, tasa)
      if (!m) continue
      assert.ok(convertirAPyg(m.replace(',', '.'), tasa) <= pyg, `${pyg} @ ${tasa}`)
      const siguiente = (Math.round(Number(m.replace(',', '.')) * 100) + 1) / 100
      assert.ok(convertirAPyg(siguiente.toFixed(2), tasa) > pyg - 0, 'es el mayor posible')
    }
  }
  assert.equal(montoMaximoEnMoneda(0, '7300'), '')
  assert.equal(montoMaximoEnMoneda(50, '7300'), '', 'menos de un centavo: no hay monto en USD')
})

test('cambiarCuentaPago propone el saldo en USD sin pasarse', () => {
  const r = cambiarCuentaPago({ exchangeRatePyg: '7300' }, CUENTAS, 'usd', 1000000)
  assert.equal(r.cambio.originalAmount, '136,98')
  assert.ok(convertirAPyg('136.98', '7300') <= 1000000)
})

test('el residuo menor a un centavo se muestra y se cierra en Gs', () => {
  const usd = { accountId: 'usd', originalAmount: '136,98', exchangeRatePyg: '7300' }
  assert.equal(residuoSubCentavo(46, usd, CUENTAS), 46)
  assert.equal(residuoSubCentavo(0, usd, CUENTAS), 0)
  assert.equal(residuoSubCentavo(5000, usd, CUENTAS), 0, 'más de un centavo: se cobra normal')
  assert.equal(residuoSubCentavo(46, { accountId: 'pyg', originalAmount: '1' }, CUENTAS), 0)
})

test('vuelto en efectivo USD: se acepta el exceso y al servidor viaja lo aplicado', () => {
  const usd = updateAccountPayment({ accountId: 'usd', originalAmount: '150', exchangeRatePyg: '7300' }, {}, CUENTAS)
  const v = vueltoEfectivoExtranjero([usd], CUENTAS, 1000000)
  assert.equal(v.vuelto, 95000)
  assert.equal(v.permitido, true)
  const enviados = pagosSinVuelto([usd], CUENTAS, 1000000)
  const suma = enviados.reduce((s, p) => s + Number(p.monto), 0)
  assert.equal(suma, 1000000, 'lo enviado cubre justo el total')
  assert.equal(enviados[0].originalAmount, '136,98')
  assert.equal(enviados.length, 2, 'el residuo sub-centavo viaja como efectivo en Gs')
  // Con transferencia en USD el exceso sigue siendo un error.
  const transf = [{ id: 'usdt', name: 'USD banco', currency: 'USD', kind: 'TRANSFER', isActive: true }, ...CUENTAS]
  const t = updateAccountPayment({ accountId: 'usdt', originalAmount: '150', exchangeRatePyg: '7300' }, {}, transf)
  assert.equal(vueltoEfectivoExtranjero([t], transf, 1000000).permitido, false)
})

test('cotización manual: rango 1.000-20.000 y aviso por desvío mayor a 5%', () => {
  assert.match(errorCotizacion('500'), /entre 1\.000 y 20\.000/)
  assert.equal(errorCotizacion('7300,5'.replace(',', '.')), '')
  assert.match(errorCotizacion('25000'), /entre/)
  assert.equal(avisoDesvioCotizacion('7300', 7300), '')
  assert.match(avisoDesvioCotizacion('8000', 7300), /apart/)
  assert.throws(() => accountPayment({ accountId: 'usd', originalAmount: '10', exchangeRatePyg: '500' }, CUENTAS), /entre 1\.000/)
})
