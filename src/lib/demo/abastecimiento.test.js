// #450 · El circuito de compras en la demo: escanear IMEI en Preparar compra,
// que Recepción cuente lo mismo, quitar uno, y que lo recibido entre al stock.
const memoriaSesion = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => (memoriaSesion.has(clave) ? memoriaSesion.get(clave) : null),
  setItem: (clave, valor) => memoriaSesion.set(clave, String(valor)),
  removeItem: (clave) => memoriaSesion.delete(clave),
}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = { location: { pathname: '/demo' }, addEventListener: () => {}, dispatchEvent: () => {} }

import test from 'node:test'
import assert from 'node:assert/strict'

const demo = await import('./abastecimiento.js')
const { imeiDemo } = await import('./iphones.js')
const { listDemoUnits } = await import('../demoInventory.js')

const linea5 = () => demo.listDemoSupplyPurchases().compras.find((c) => c.code === 'CMP-AUR-0001').lines[0]

test('la demo arranca con compras en curso: IMEI cargados y pendientes', () => {
  const lista = demo.listDemoSupplyPurchases({ pendientes: 1 })
  assert.ok(lista.compras.length >= 3, 'varias compras con IMEI por completar')
  const sp4 = lista.compras.find((c) => c.code === 'CMP-AUR-0004')
  assert.equal(sp4.lines[0].serials.length, 2)
  assert.equal(sp4.lines[0].faltan, 2)
  assert.deepEqual(sp4.lines[0].serials.map((s) => s.estado), ['pendiente', 'verificado'])
})

test('escanear en Preparar compra suma el IMEI, Recepción lo cuenta igual y se puede quitar', () => {
  const compra = demo.listDemoSupplyPurchases().compras.find((c) => c.code === 'CMP-AUR-0001')
  const antes = linea5()
  const imei = imeiDemo(501)
  const res = demo.updateDemoSupplyPurchase({ id: compra.id, action: 'scan', lineId: antes.id, serial: imei })
  assert.equal(res.lines[0].serials.length, antes.serials.length + 1)
  assert.equal(res.lines[0].faltan, antes.faltan - 1)
  // La misma fuente: el lote en tránsito ya no cuenta ese IMEI como pendiente.
  const lote = demo.listDemoSupplyShipments({ pendientes: 1 }).envios.find((e) => e.code === 'LOTE-AUR-0002')
  assert.equal(lote.pendientes, res.lines[0].faltan)
  // Duplicados y Luhn.
  assert.throws(() => demo.updateDemoSupplyPurchase({ id: compra.id, action: 'scan', lineId: antes.id, serial: imei }), /ya está cargado/)
  const malo = `${imeiDemo(502).slice(0, 14)}${(Number(imeiDemo(502)[14]) + 1) % 10}`
  assert.throws(() => demo.updateDemoSupplyPurchase({ id: compra.id, action: 'scan', lineId: antes.id, serial: malo }), /Luhn/)
  demo.updateDemoSupplyPurchase({ id: compra.id, action: 'scan', lineId: antes.id, serial: malo, forzarLuhn: true })
  // Quitar uno libera la unidad del lote.
  const tras = demo.updateDemoSupplyPurchase({ id: compra.id, action: 'removeSerial', lineId: antes.id, serial: imei })
  assert.ok(!tras.lines[0].serials.some((s) => s.serial === imei))
})

test('recibir el lote deja los IMEI recibidos en el stock de la demo', () => {
  const llegada = demo.listDemoSupplyReceptions({ pendientes: 1 }).llegadas.find((l) => l.code === 'LOTE-AUR-0002')
  const detalle = demo.demoSupplyReceptionDetail({ shipmentId: llegada.id })
  const esperado = detalle.esperados.find((item) => item.serial)
  const recepcion = detalle.recepcion
  demo.updateDemoSupplyReception({ id: recepcion.id, action: 'scan', serial: esperado.serial, shipmentItemId: esperado.shipmentItemId, productId: esperado.productId })
  demo.updateDemoSupplyReception({ id: recepcion.id, action: 'confirm' })
  assert.ok(listDemoUnits(esperado.serial).length === 1, 'la unidad recibida aparece en Stock')
  const estado = demo.listDemoSupplyPurchases().compras.find((c) => c.code === 'CMP-AUR-0001').lines[0].serials.find((s) => s.serial === esperado.serial)
  assert.equal(estado.estado, 'recibido')
})
