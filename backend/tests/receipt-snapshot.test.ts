import assert from 'node:assert/strict'
import test from 'node:test'
import { armarComprobante } from '../lib/orders'

test('el comprobante guarda versión, fecha y los datos emitidos', () => {
  const pedido = { orderNumber: 'MOS-0007', totalPyg: 150000, items: [{ description: 'iPhone 13', serials: ['356789012345678'] }] }
  const comprobante = armarComprobante(pedido)

  assert.equal(comprobante.version, 1)
  assert.ok(!Number.isNaN(Date.parse(comprobante.emitidoEn)))
  assert.deepEqual(comprobante.datos, pedido)
})

test('los datos emitidos no se copian por referencia', () => {
  const pedido: Record<string, unknown> = { orderNumber: 'MOS-0008', totalPyg: 1000 }
  const comprobante = armarComprobante(pedido)
  pedido.totalPyg = 999

  assert.equal((comprobante.datos as Record<string, unknown>).totalPyg, 1000)
})
