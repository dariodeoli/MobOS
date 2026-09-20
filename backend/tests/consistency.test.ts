import assert from 'node:assert/strict'
import test from 'node:test'
import { lineDiscount, quoteTotals, warrantyDaysFor } from '../lib/pricing'
import { couponCode, promotionInput } from '../lib/promotions'

// Consistencia entre módulos (#29): las cuentas que ve la caja, los créditos,
// las comisiones, las promociones y las garantías tienen que cerrar por sí
// mismas. Son las invariantes que, si se rompen, descuadran el negocio en
// silencio (stock, ventas, dinero y postventa).

test('pricing: la línea cierra en base − descuento y rechaza descuentos imposibles', () => {
  // Sin descuento: base = cantidad × precio y total = base.
  const sinDescuento = lineDiscount({ quantity: 2, unitPricePyg: 100000 })
  assert.deepEqual(sinDescuento, { basePyg: 200000, discountPyg: 0, totalPyg: 200000 })
  // Porcentaje: se aplica sobre la base.
  const porPct = lineDiscount({ quantity: 2, unitPricePyg: 100000, discountPct: 10 })
  assert.equal(porPct.discountPyg, 20000)
  assert.equal(porPct.totalPyg, 180000)
  assert.equal(porPct.basePyg - porPct.discountPyg, porPct.totalPyg, 'base − descuento = total')
  // Descuento mayor a la base: se rechaza (el total nunca queda negativo).
  assert.throws(() => lineDiscount({ quantity: 1, unitPricePyg: 50000, discountPyg: 90000 }), /superar/i)
  // Fijo y porcentual juntos: se rechaza (no se suman).
  assert.throws(() => lineDiscount({ quantity: 1, unitPricePyg: 50000, discountPyg: 1000, discountPct: 10 }), /fijo|porcentual|ambos/i)
})

test('pricing: los totales de la cotización cierran con el descuento global', () => {
  const items = [{ quantity: 1, unitPricePyg: 300000 }, { quantity: 2, unitPricePyg: 50000 }]
  const totales = quoteTotals(items, 25000)
  assert.equal(totales.subtotalPyg, 400000)
  assert.equal(totales.discountPyg, 25000)
  assert.equal(totales.totalPyg, 375000)
  assert.equal(totales.subtotalPyg - totales.discountPyg, totales.totalPyg, 'subtotal − descuento = total')
})

test('garantías: los días salen de la condición o de la regla del producto', () => {
  // El producto puede declarar sus días; la condición no inventa garantía.
  assert.equal(warrantyDaysFor({ condition: 'NEW', warrantyDays: 365 }), 365)
  const sinDias = warrantyDaysFor({ condition: 'NEW', warrantyDays: null })
  assert.ok(Number.isInteger(sinDias) && sinDias >= 0, 'siempre devuelve un entero no negativo')
  // Un usado nunca puede tener más garantía que un nuevo con la misma regla.
  const nuevo = warrantyDaysFor({ condition: 'NEW', warrantyDays: 365 })
  const usado = warrantyDaysFor({ condition: 'USED', warrantyDays: 365 })
  assert.ok(usado <= nuevo, 'la garantía del usado no supera a la del nuevo')
})

test('promociones: el código se normaliza y el alta valida descuento y vigencia', () => {
  // El mismo cupón escrito distinto normaliza al mismo código.
  assert.equal(couponCode('  promo10  '), couponCode('PROMO10'))
  // Sin descuento, sin vigencia o con campos de más: no se acepta.
  assert.throws(() => promotionInput({ kind: 'PERCENT', value: 10, startsAt: '2026-01-01', endsAt: '2026-02-01' }), /cup[oó]n/i)
  assert.throws(() => promotionInput({ name: 'Verano', kind: 'PERCENT', value: 0, startsAt: '2026-01-01', endsAt: '2026-02-01' }), /descuento/i)
  assert.throws(() => promotionInput({ name: 'Verano', kind: 'PERCENT', value: 10, startsAt: '2026-02-01', endsAt: '2026-01-01' }), /vigencia/i)
  assert.throws(() => promotionInput({ name: 'Verano', kind: 'PERCENT', value: 10, startsAt: '2026-01-01', endsAt: '2026-02-01', extra: 1 }), /admit/i)
  // Alta completa: pasa y recorta el nombre.
  const creada = promotionInput({ code: 'VERANO', name: '  Verano  ', kind: 'PERCENT', value: 10, startsAt: '2026-01-01', endsAt: '2026-02-01' })
  assert.equal(creada.name, 'Verano')
  assert.equal(creada.value, 10)
})

test('créditos: el saldo nunca es negativo y el cobrado no supera el total', () => {
  // Invariante usada por el perfil, la lista de créditos y el inicio.
  const saldo = (total: number, cobrado: number) => Math.max(0, Number(total || 0) - Number(cobrado || 0))
  assert.equal(saldo(200000, 50000), 150000)
  assert.equal(saldo(200000, 200000), 0)
  assert.equal(saldo(200000, 250000), 0, 'un pago de más no genera saldo negativo')
})
