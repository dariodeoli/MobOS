import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarPendientes,
  cuentasRapidas,
  etiquetaConfirmar,
  montoDeTeclado,
  pagoDeMedio,
  puedeVenderIgual,
  textoArticulos,
  tituloPago,
  vueltoEfectivo,
} from './posMovil.js'

const cuentas = [
  { id: 'a', name: 'Caja · Guaraníes', kind: 'CASH', currency: 'PYG', isActive: true },
  { id: 'b', name: 'Itaú', kind: 'TRANSFER', currency: 'PYG', isActive: true },
  { id: 'c', name: 'Caja · Dólares', kind: 'CASH', currency: 'USD', isActive: true },
  { id: 'd', name: 'Canje', kind: 'TRADE_IN', currency: 'PYG', isActive: true },
  { id: 'e', name: 'Vieja', kind: 'CARD', currency: 'PYG', isActive: false },
]

test('el pago se nombra por orden: Pago, Segundo pago, Tercer pago', () => {
  assert.equal(tituloPago(0), 'Pago')
  assert.equal(tituloPago(1), 'Segundo pago')
  assert.equal(tituloPago(2), 'Tercer pago')
  assert.equal(tituloPago(99), 'Sexto pago')
})

test('cobro con un toque: solo cuentas activas en guaraníes y sin datos extra', () => {
  assert.deepEqual(cuentasRapidas(cuentas).map(c => c.id), ['a', 'b'])
})

test('el pago de una cuenta en guaraníes sale con monto entero y la cuenta elegida', () => {
  const pago = pagoDeMedio(cuentas[0], 1_000_000)
  assert.equal(pago.accountId, 'a')
  assert.equal(pago.monto, '1000000')
  assert.equal(pago.originalAmount, '1000000')
  assert.equal(pago.cuenta, 'Caja · Guaraníes')
})

test('sin cuentas configuradas el pago conserva la forma legacy', () => {
  assert.deepEqual(pagoDeMedio({ id: 'DINERO', name: 'DINERO', legacy: true }, 50000), { medioPago: 'DINERO', cuenta: '', monto: '50000' })
})

test('vuelto: lo recibido menos lo aplicado, nunca negativo', () => {
  assert.equal(vueltoEfectivo(1_100_000, 1_000_000), 100_000)
  assert.equal(vueltoEfectivo(500_000, 1_000_000), 0)
})

test('el teclado topa el monto al límite de ventas y ignora ceros a la izquierda', () => {
  assert.equal(montoDeTeclado('0001500'), 1500)
  assert.equal(montoDeTeclado('999999999999999'), 99_000_000_000)
  assert.equal(montoDeTeclado(''), 0)
})

test('«Vender igual» solo con permiso y nunca para equipos con IMEI', () => {
  assert.equal(puedeVenderIgual({ permiso: true, motivo: 'stock' }), true)
  assert.equal(puedeVenderIgual({ permiso: false, motivo: 'stock' }), false)
  assert.equal(puedeVenderIgual({ permiso: true, motivo: 'imei' }), false)
  const lista = [{ key: '1', motivo: 'stock' }, { key: '2', motivo: 'imei' }]
  const r = clasificarPendientes(lista, true)
  assert.equal(r.sinStock.length, 1)
  assert.equal(r.conImei.length, 1)
  assert.equal(r.puedeVenderIgual, false)
  assert.equal(clasificarPendientes([lista[0]], true).puedeVenderIgual, true)
  assert.equal(clasificarPendientes([lista[0]], false).puedeVenderIgual, false)
})

test('texto del carrito en singular y plural', () => {
  assert.equal(textoArticulos(1), '1 artículo')
  assert.equal(textoArticulos(3), '3 artículos')
})

test('el botón de guardar dice qué se crea según lo cobrado', () => {
  const base = { guardando: false, valido: true, totalGeneral: 100, totalPagado: 0, venderACredito: false, pagaAlRecibir: false }
  assert.equal(etiquetaConfirmar({ ...base, totalPagado: 100 }), 'Confirmar venta')
  assert.equal(etiquetaConfirmar({ ...base, totalPagado: 40 }), 'Crear pedido')
  assert.equal(etiquetaConfirmar(base), 'Crear pedido sin pago')
  assert.equal(etiquetaConfirmar({ ...base, pagaAlRecibir: true }), 'Crear pedido · paga al recibir')
  assert.equal(etiquetaConfirmar({ ...base, venderACredito: true }), 'Crear pedido a crédito')
  assert.equal(etiquetaConfirmar({ ...base, valido: false }), 'Guardar pedido')
  assert.equal(etiquetaConfirmar({ ...base, guardando: true }), 'Guardando venta…')
})
