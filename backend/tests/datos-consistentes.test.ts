import assert from 'node:assert/strict'
import test from 'node:test'
import { displayOrderNumber, formatOrderNumber, orderNumberLookupCandidates } from '../lib/order-number'
import { esperadoCaja, esperadoPorMoneda, vueltoPyg } from '../lib/cash-expected-pure'
import { netPaid } from '../lib/payment-net-pure'
import { subCentResidue, residueMessage } from '../lib/payment-residue'
import { warrantyDaysOfItem } from '../lib/order-warranty'

// #461 · numeración de pantalla, saldo residual por redondeo y garantía por línea.

test('displayOrderNumber muestra AUR-0003 sin «#» y acepta el formato guardado y el de la demo', () => {
  assert.equal(displayOrderNumber('AUR-#0003'), 'AUR-0003')
  assert.equal(displayOrderNumber('AUR-0003'), 'AUR-0003')
  assert.equal(displayOrderNumber('MOB #7'), 'MOB-0007')
  assert.equal(displayOrderNumber('MOB-#10000'), 'MOB-10000')
  assert.equal(displayOrderNumber('E2E-SEED-001'), 'E2E-SEED-001')
  assert.equal(displayOrderNumber(null), '')
  // El valor guardado no cambia: el servidor sigue escribiendo `PREFIX-#0001`.
  assert.equal(formatOrderNumber('AUR', 3), 'AUR-#0003')
})

test('subCentResidue marca el saldo menor a un centavo de la moneda cobrada (Gs 7 con el dólar a 7.350)', () => {
  const usd = { currency: 'USD', exchangeRatePyg: '7350.000000', status: 'CONFIRMED' }
  assert.equal(subCentResidue(7, [usd]), 7)
  assert.equal(subCentResidue(73, [usd]), 73, 'un centavo son Gs 73,5: por debajo no se cobra en dólares')
  assert.equal(subCentResidue(74, [usd]), 0, 'un centavo entero ya se puede cobrar')
  assert.equal(subCentResidue(0, [usd]), 0)
  // Sin pagos en moneda extranjera (o el último confirmado es en guaraníes) no hay residuo de redondeo.
  assert.equal(subCentResidue(7, [{ currency: 'PYG', exchangeRatePyg: 1 }]), 0)
  assert.equal(subCentResidue(7, [usd, { currency: 'PYG', exchangeRatePyg: 1 }]), 0)
  // Un pago pendiente no cuenta; se mira el último confirmado.
  assert.equal(subCentResidue(7, [usd, { currency: 'PYG', status: 'PENDING' }]), 7)
  assert.equal(subCentResidue(7, []), 0)
  assert.match(residueMessage(7), /Gs 7/)
  assert.match(residueMessage(7), /guaraníes/)
})

test('warrantyDaysOfItem: días del producto o por condición solo en líneas con IMEI o con días propios', () => {
  const nuevo = { condition: 'NEW', warrantyDays: null }
  assert.equal(warrantyDaysOfItem({ id: 'i1', productId: 'p1', serials: ['356938035643809'] }, nuevo), 365)
  assert.equal(warrantyDaysOfItem({ id: 'i1', productId: 'p1', serials: ['356938035643809'] }, { condition: 'USED', warrantyDays: null }), 90)
  assert.equal(warrantyDaysOfItem({ id: 'i1', productId: 'p1', serials: ['356938035643809'] }, { condition: 'NEW', warrantyDays: 180 }), 180)
  // Un accesorio sin IMEI ni días propios no inventa garantía.
  assert.equal(warrantyDaysOfItem({ id: 'i2', productId: 'p2', serials: [] }, nuevo), null)
  assert.equal(warrantyDaysOfItem({ id: 'i2', productId: 'p2', serials: [] }, { condition: 'NEW', warrantyDays: 30 }), 30)
  assert.equal(warrantyDaysOfItem({ id: 'i3', productId: null, serials: ['X'] }, nuevo), null)
  assert.equal(warrantyDaysOfItem({ id: 'i4', productId: 'p1', serials: ['X'] }, { condition: 'NEW', warrantyDays: 0 }), null)
})

test('displayOrderNumber y la búsqueda aceptan prefijos de cualquier largo, con o sin «#»', () => {
  assert.equal(displayOrderNumber('A-#7'), 'A-0007')
  assert.equal(displayOrderNumber('MOBOS-#0012'), 'MOBOS-0012')
  assert.equal(displayOrderNumber('mobos 12'), 'MOBOS-0012')
  // El texto escrito por una persona encuentra el número guardado (`AUR-#0003`).
  for (const escrito of ['AUR-0003', 'AUR-#0003', 'aur 3', 'AUR#3', ' AUR-3 ']) {
    assert.ok(orderNumberLookupCandidates(escrito).includes('AUR-#0003'), `«${escrito}» → AUR-#0003`)
  }
  assert.ok(orderNumberLookupCandidates('MOBOS-0012').includes('MOBOS-#0012'))
  assert.ok(orderNumberLookupCandidates('MOB-10000').includes('MOB-#10000'))
  assert.deepEqual(orderNumberLookupCandidates('E2E-SEED-001'), ['E2E-SEED-001'])
  assert.deepEqual(orderNumberLookupCandidates(''), [])
})

test('esperadoCaja: neto con signo, sin recortar antes de sumar la apertura (retiros, ingresos, sin ventas, mezcla)', () => {
  // Apertura 500.000 con un retiro de 200.000 y sin ventas: 300.000 (antes daba 500.000).
  assert.equal(esperadoCaja(500000, 0 - 200000), 300000)
  // Ingreso de caja de 100.000 sin ventas.
  assert.equal(esperadoCaja(500000, 100000), 600000)
  // Sin ventas ni movimientos.
  assert.equal(esperadoCaja(500000, 0), 500000)
  // Mezcla: ventas en efectivo 250.000 − reembolso 100.000 + aporte 300.000 − retiro 150.000.
  assert.equal(esperadoCaja(500000, 250000 - 100000 + 300000 - 150000), 800000)
  // Retirar más de lo que hay deja un esperado NEGATIVO: es una señal real, no se esconde.
  assert.equal(esperadoCaja(500000, -700000), -200000)
})

test('esperadoPorMoneda (#455): la misma fórmula con signo en cada moneda; la apertura es solo en Gs', () => {
  // US$ 150 entregados por Gs 1.000.000: USD +150; Gs = apertura + residuo 46 − vuelto 95.046.
  const vuelto = vueltoPyg(150, 7300, 999954)
  assert.equal(vuelto, 95046)
  assert.deepEqual(esperadoPorMoneda(2000000, { PYG: 46 - vuelto, USD: 150 }), { PYG: 2000000 + 46 - 95046, USD: 150 })
  // Sin movimiento en dólares igual aparece USD en cero; un retiro en USD da negativo (sin recorte).
  assert.deepEqual(esperadoPorMoneda(100000, {}), { PYG: 100000, USD: 0 })
  assert.equal(esperadoPorMoneda(0, { USD: -20.5 }).USD, -20.5)
  // Redondeo: Gs enteros, dólares a centavos.
  assert.equal(esperadoPorMoneda(0, { PYG: 10.4, USD: 1.005 + 1.005 }).PYG, 10)
})

test('vueltoPyg (#455): entrega en su moneda menos lo aplicado, HALF_UP y nunca negativo', () => {
  assert.equal(vueltoPyg(1200000, 1, 1000000), 200000)
  assert.equal(vueltoPyg(150, 7300, 1095000), 0)
  assert.equal(vueltoPyg(100, 7300, 1095000), 0)
  assert.equal(vueltoPyg(150.01, 7300.5, 1000000), Math.round(150.01 * 7300.5) - 1000000)
})

test('netPaid: pagado neto = confirmado (con reversiones) − reembolsado', () => {
  const cobro = { status: 'CONFIRMED', amountPyg: 250000 }
  assert.equal(netPaid([cobro]), 250000)
  assert.equal(netPaid([cobro, { status: 'REFUNDED', amountPyg: 100000 }]), 150000, 'reembolso parcial')
  assert.equal(netPaid([cobro, { status: 'REFUNDED', amountPyg: 250000 }]), 0, 'reembolso total')
  assert.equal(netPaid([cobro, { status: 'PENDING', amountPyg: 5000 }, { status: 'REJECTED', amountPyg: 9000 }]), 250000)
  // Una corrección (reversión negativa + pago nuevo) no cambia el neto.
  assert.equal(netPaid([cobro, { status: 'CONFIRMED', amountPyg: -250000 }, { status: 'CONFIRMED', amountPyg: 250000 }, { status: 'REFUNDED', amountPyg: 50000 }]), 200000)
})
