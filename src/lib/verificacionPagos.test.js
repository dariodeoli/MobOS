import test from 'node:test'
import assert from 'node:assert/strict'
import {
  antiguedadTexto, categoriasDelDia, errorDiscrepancia, estadoVisiblePago, lineaDelDia, minutosDesde, motivoEntregaBloqueada,
  necesitaRefrescoPagos, resumenResultado, resumenVerificacionPedido, sumarResultados, tabDeTipo, tabValida, hoyParaguay,
} from './verificacionPagos.js'

test('cada tipo de autorización cae en una pestaña y lo desconocido va a Otros', () => {
  assert.equal(tabDeTipo('DISCOUNT'), 'precios')
  assert.equal(tabDeTipo('ORDER_CREDIT_OVER'), 'credito')
  assert.equal(tabDeTipo('STOCK_ADJUST'), 'otros')
  assert.equal(tabDeTipo('TIPO_NUEVO'), 'otros')
  assert.equal(tabValida('pagos'), 'pagos')
  assert.equal(tabValida('x'), '')
})

test('antigüedad legible', () => {
  assert.equal(antiguedadTexto(0), 'recién')
  assert.equal(antiguedadTexto(12), 'hace 12 min')
  assert.equal(antiguedadTexto(190), 'hace 3 h')
  assert.equal(antiguedadTexto(3000), 'hace 2 d')
  assert.equal(minutosDesde('2026-10-22T10:00:00Z', Date.parse('2026-10-22T10:30:00Z')), 30)
})

test('estado visible del pago según estado y origen', () => {
  assert.equal(estadoVisiblePago({ status: 'PENDING', pendingReason: 'VERIFICACION' }).label, 'Pendiente de verificación')
  assert.equal(estadoVisiblePago({ status: 'CONFIRMED', pendingReason: 'VERIFICACION' }).label, 'Aprobado')
  const rechazado = estadoVisiblePago({ status: 'REJECTED', reconciliation: { note: 'No llegó la transferencia' } })
  assert.equal(rechazado.label, 'Rechazado')
  assert.equal(rechazado.motivo, 'No llegó la transferencia')
  assert.equal(estadoVisiblePago({ status: 'PENDING', pendingReason: 'CUOTA' }).label, 'Por cobrar')
  assert.equal(estadoVisiblePago({ status: 'CONFIRMED' }).label, 'Confirmado')
})

test('la entrega se bloquea solo con cobros en verificación', () => {
  const pagos = [
    { status: 'CONFIRMED', amountPyg: 100000 },
    { status: 'PENDING', pendingReason: 'VERIFICACION', amountPyg: 545000, proofs: [] },
    { status: 'PENDING', pendingReason: 'CUOTA', amountPyg: 50000 },
  ]
  const resumen = resumenVerificacionPedido(pagos)
  assert.equal(resumen.cantidad, 1)
  assert.equal(resumen.montoPyg, 545000)
  assert.equal(resumen.bloqueaEntrega, true)
  assert.equal(resumen.sinComprobante.length, 1)
  assert.match(motivoEntregaBloqueada(resumen, n => `Gs ${n}`), /Pago en verificación \(1 cobro · Gs 545000\)/)
  assert.equal(motivoEntregaBloqueada(resumenVerificacionPedido([{ status: 'CONFIRMED' }])), '')
  assert.equal(necesitaRefrescoPagos(pagos), true)
  assert.equal(necesitaRefrescoPagos([{ status: 'CONFIRMED', pendingReason: 'VERIFICACION' }]), false)
})

test('categorías del día por método con totales completos', () => {
  const base = { confirmedPyg: 0, pendingPyg: 0, rejectedPyg: 0, count: 0, toVerifyCount: 0, pendingCount: 0 }
  const categorias = categoriasDelDia([
    { ...base, method: 'TRANSFER', confirmedPyg: 1000000, count: 2, toVerifyCount: 2 },
    { ...base, method: 'TRANSFER', confirmedPyg: 500000, count: 1, pendingCount: 1 },
    { ...base, method: 'CASH', confirmedPyg: 3000000, count: 4 },
  ])
  assert.deepEqual(categorias.map(c => [c.label, c.confirmedPyg, c.count, c.porVerificar]), [['Efectivo', 3000000, 4, 0], ['Transferencias', 1500000, 3, 3]])
})

test('línea del día y resumen de verificación', () => {
  const linea = lineaDelDia({ orderNumber: '04234', amountPyg: 545000, customerName: 'Ana Pérez', collectedByName: 'Diego', at: 'x' }, { formatear: n => `Gs ${n}`, hora: () => '14:32' })
  assert.equal(linea, 'Pedido #04234 · Gs 545000 · Ana Pérez · cobrado por Diego · 14:32')
  assert.equal(resumenResultado({ verified: 3, alreadyVerified: 1, skipped: [{}] }), '3 verificados · 1 ya estaba verificado · 1 sin verificar')
  const suma = sumarResultados([{ attempted: 2, verified: 2, alreadyVerified: 0, skipped: [] }, { attempted: 1, verified: 0, alreadyVerified: 1, skipped: [{ code: 'OWN' }] }])
  assert.deepEqual([suma.attempted, suma.verified, suma.alreadyVerified, suma.skipped.length], [3, 2, 1, 1])
})

test('validación de discrepancia', () => {
  assert.match(errorDiscrepancia({ recibido: '', esperado: 100, motivo: 'x' }), /Indicá lo recibido/)
  assert.match(errorDiscrepancia({ recibido: '100', esperado: 100, motivo: 'x' }), /coincide/)
  assert.match(errorDiscrepancia({ recibido: '90', esperado: 100, motivo: ' ' }), /motivo/)
  assert.equal(errorDiscrepancia({ recibido: '0', esperado: 100, motivo: 'No llegó' }), '')
})

test('día de Paraguay (UTC-3)', () => {
  assert.equal(hoyParaguay(new Date('2026-10-22T02:00:00Z')), '2026-10-21')
  assert.equal(hoyParaguay(new Date('2026-10-22T12:00:00Z')), '2026-10-22')
})
