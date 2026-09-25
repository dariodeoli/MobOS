import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeMontosFueraDeRango, montosFueraDeRango, TOPE_VENTA } from './limitesVenta.js'

test('una venta que entra no reporta montos fuera de rango', () => {
  const excesos = montosFueraDeRango({
    lineas: [{ nombre: 'iPhone 15', precio: 6_500_000, cantidad: 2, descuento: 100_000 }],
    descuento: 50_000,
    envio: 30_000,
    pagos: [{ monto: 12_880_000 }],
    totalGeneral: 12_880_000,
    totalPagado: 12_880_000,
  })
  assert.deepEqual(excesos, [])
  assert.equal(mensajeMontosFueraDeRango(excesos), '')
})

test('el precio unitario por encima del tope se reporta con el nombre del producto', () => {
  const excesos = montosFueraDeRango({ lineas: [{ nombre: 'iPhone 15', precio: TOPE_VENTA + 1 }] })
  assert.deepEqual(excesos, [{ campo: 'el precio de iPhone 15', monto: TOPE_VENTA + 1 }])
})

test('el total de la línea se revisa con la cantidad (no alcanza con el precio)', () => {
  const precio = 1_500_000_000
  const excesos = montosFueraDeRango({ lineas: [{ nombre: 'MacBook', precio, cantidad: 2 }] })
  assert.deepEqual(excesos, [{ campo: 'el total de MacBook', monto: 3_000_000_000 }])
})

test('pagos, descuento, envío y totales también se revisan', () => {
  const excesos = montosFueraDeRango({
    lineas: [{ nombre: 'iPhone', precio: 1_000_000 }],
    descuento: TOPE_VENTA + 10,
    envio: TOPE_VENTA + 20,
    pagos: [{ monto: 1_000_000 }, { monto: TOPE_VENTA + 30 }],
    totalGeneral: TOPE_VENTA + 40,
    totalPagado: TOPE_VENTA + 30,
  })
  assert.deepEqual(excesos.map((exceso) => exceso.campo), [
    'el descuento',
    'el envío',
    'el pago 2',
    'el total de la venta',
    'lo pagado',
  ])
})

test('el mensaje nombra el primer monto, el tope real y los que faltan', () => {
  const unico = mensajeMontosFueraDeRango([{ campo: 'el precio de iPhone 15', monto: 5_000_000_000 }])
  assert.match(unico, /^No se puede guardar: el precio de iPhone 15 \(Gs 5\.000\.000\.000\) supera el máximo que el sistema puede guardar \(Gs 2\.147\.483\.647\)\./)
  assert.match(unico, /Bajá el monto para continuar\.$/)
  assert.doesNotMatch(unico, /Revisá también/)

  const varios = mensajeMontosFueraDeRango([
    { campo: 'el precio de iPhone 15', monto: 5_000_000_000 },
    { campo: 'el pago 1', monto: 3_000_000_000 },
    { campo: 'lo pagado', monto: 3_000_000_000 },
  ])
  assert.match(varios, /Revisá también 2 montos más\.$/)
})
