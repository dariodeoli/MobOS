import assert from 'node:assert/strict'
import test from 'node:test'
import { displayOrderNumber, formatOrderNumber } from '../lib/order-number'
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
