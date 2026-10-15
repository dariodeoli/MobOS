import test from 'node:test'
import assert from 'node:assert/strict'
import { codigoPedido, fechaCompacta, fechaLegible, pagadoNeto, totalesPedido } from './pedido.js'

test('muestra los códigos como PREFIX-NNNN (sin «#») con padding a 4 dígitos (#461)', () => {
  // El servidor guarda `AUR-#0003` y la demo `AUR-0003`: en pantalla es siempre `AUR-0003`.
  assert.equal(codigoPedido('MOB-#0001'), 'MOB-0001')
  assert.equal(codigoPedido('MOB #1'), 'MOB-0001')
  assert.equal(codigoPedido('ABC-#12'), 'ABC-0012')
  assert.equal(codigoPedido('TST-#0007'), 'TST-0007')
  assert.equal(codigoPedido('MOB-0001'), 'MOB-0001')
  assert.equal(codigoPedido('AUR-#0003'), codigoPedido('AUR-0003'))
  assert.equal(codigoPedido('MOB-#10000'), 'MOB-10000')
})

test('deja tal cual los formatos que no son PREFIX-NNNN y normaliza los viejos', () => {
  assert.equal(codigoPedido('E2E-SEED-001'), 'E2E-SEED-001')
  assert.equal(codigoPedido(''), '')
  assert.equal(codigoPedido(null), '')
  // Los códigos viejos con prefijo y número se muestran con el formato único.
  assert.equal(codigoPedido('KO #31754'), 'KO-31754')
})

test('la fecha del listado es compacta: "17 sep · 15:30" en 24 h', () => {
  assert.equal(fechaCompacta('2026-09-17T15:30:00'), '17 sep · 15:30')
  assert.equal(fechaCompacta('2026-01-02T09:05:00'), '02 ene · 09:05')
  assert.equal(fechaCompacta('2026-12-31T23:59:00'), '31 dic · 23:59')
})

test('la fecha del listado usa Hoy/Ayer/Anteayer y después la fecha compacta', () => {
  const ahora = new Date()
  const aLas = (dias, hora) => new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias, hora, 30).toISOString()
  assert.equal(fechaLegible(aLas(0, 15)), 'Hoy 15:30')
  assert.equal(fechaLegible(aLas(1, 9)), 'Ayer 09:30')
  assert.equal(fechaLegible(aLas(2, 20)), 'Anteayer 20:30')
  assert.match(fechaLegible(aLas(5, 8)), /^\d{2} \w{3} · 08:30$/)
  assert.equal(fechaLegible(''), 'Sin fecha')
})

test('sin fecha válida la celda no rompe la grilla', () => {
  assert.equal(fechaCompacta(''), 'Sin fecha')
  assert.equal(fechaCompacta(null), 'Sin fecha')
  assert.equal(fechaCompacta('no-es-fecha'), 'Sin fecha')
})

test('totales del pedido: pagos confirmados, saldo y formas API/demo', () => {
  // Forma API: payments con status y totalPyg.
  assert.deepEqual(totalesPedido({
    totalPyg: 100000,
    payments: [
      { status: 'CONFIRMED', amountPyg: 40000 },
      { status: 'PENDING', amountPyg: 10000 },
      { amountPyg: 10000 },
    ],
  }), { total: 100000, pagado: 50000, pendiente: 50000, estado: 'Parcial' })
  // Forma demo/local: totalPagado sin payments.
  assert.deepEqual(totalesPedido({ total: 30000, totalPagado: 30000 }), { total: 30000, pagado: 30000, pendiente: 0, estado: 'Pagado' })
  // Un pago mayor al total no genera saldo negativo.
  assert.deepEqual(totalesPedido({ totalPyg: 1000, payments: [{ status: 'CONFIRMED', amountPyg: 1500 }] }), { total: 1000, pagado: 1500, pendiente: 0, estado: 'Pagado' })
  // Pedido ausente.
  assert.deepEqual(totalesPedido(null), { total: 0, pagado: 0, pendiente: 0, estado: 'Pendiente' })
})

test('Pagado/Saldo: una sola cuenta para la forma API y la legacy de la demo (#461)', () => {
  // Venta demo: pagos legacy sin `status`, con `monto`; el detalle, el listado y la ficha leen lo mismo.
  const demo = { precio: 80000, montoDelivery: 0, pagos: [{ monto: 50000 }, { monto: 30000 }] }
  assert.deepEqual(totalesPedido(demo), { total: 80000, pagado: 80000, pendiente: 0, estado: 'Pagado' })
  // Fila del listado: `payments` apunta a los mismos pagos.
  assert.deepEqual(totalesPedido({ ...demo, payments: demo.pagos }), totalesPedido(demo))
  // Corrección: la reversión resta por su signo y el pago nuevo suma.
  const corregido = { totalPyg: 100000, payments: [
    { id: 'a', status: 'CONFIRMED', amountPyg: 100000 },
    { id: 'r', status: 'CONFIRMED', amountPyg: -100000, reversalOfId: 'a' },
    { id: 'n', status: 'CONFIRMED', amountPyg: 100000 },
  ] }
  assert.deepEqual(totalesPedido(corregido), { total: 100000, pagado: 100000, pendiente: 0, estado: 'Pagado' })
  // Pago pendiente del repartidor: no cuenta hasta confirmarse.
  assert.equal(totalesPedido({ totalPyg: 100000, pagos: [{ status: 'PENDING', monto: 100000 }] }).pagado, 0)
})

test('codigoPedido acepta prefijos de cualquier largo igual que el backend', () => {
  assert.equal(codigoPedido('A-#7'), 'A-0007')
  assert.equal(codigoPedido('MOBOS-#0012'), 'MOBOS-0012')
  assert.equal(codigoPedido('mobos 12'), 'MOBOS-0012')
})

test('totalesPedido: un reembolso parcial baja el pagado y sube el saldo; cancelado no debe nada', () => {
  const pedido = { totalPyg: 250000, payments: [{ status: 'CONFIRMED', amountPyg: 250000 }, { status: 'REFUNDED', amountPyg: 100000 }] }
  assert.deepEqual(totalesPedido(pedido), { total: 250000, pagado: 150000, pendiente: 100000, estado: 'Parcial' })
  assert.equal(pagadoNeto([{ monto: 80000 }, { status: 'REFUNDED', monto: 30000 }]), 50000)
  const devuelto = { totalPyg: 250000, status: 'CANCELLED', payments: [{ status: 'CONFIRMED', amountPyg: 250000 }, { status: 'REFUNDED', amountPyg: 250000 }] }
  assert.deepEqual(totalesPedido(devuelto), { total: 250000, pagado: 0, pendiente: 0, estado: 'Pendiente' })
})
