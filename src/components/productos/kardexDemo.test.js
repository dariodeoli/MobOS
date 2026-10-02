// Kardex del demo (#306): los movimientos se reconstruyen desde las unidades
// del inventario ficticio y cierran contra el stock disponible. Sin navegador:
// el módulo es puro y se prueba con node --test.
import assert from 'node:assert/strict'
import test from 'node:test'
import { construirKardexDemo, eventosDemo } from './kardexDemo.js'

const PRODUCTO = { id: 'p1', sku: 'P-1', name: 'Producto demo', stock: 1 }
const hace = (dias) => new Date(2026, 8, 20 - dias, 10, 0, 0)

const unidad = (extra = {}) => ({
  id: 'u1',
  productId: 'p1',
  serial: 'AUR0000000000001',
  status: 'AVAILABLE',
  createdAt: hace(10).toISOString(),
  ...extra,
})

test('cada unidad disponible suma su alta y el saldo cierra contra el stock', () => {
  const data = construirKardexDemo({
    producto: { ...PRODUCTO, stock: 2 },
    unidades: [unidad(), unidad({ id: 'u2', serial: 'AUR0000000000002', createdAt: hace(7).toISOString() })],
  })
  assert.equal(data.demo, true)
  assert.equal(data.producto.stock, 2)
  assert.equal(data.saldoInicial, 0)
  assert.equal(data.total, 2)
  assert.equal(data.cierre, 2)
  assert.deepEqual(data.totales, { entradas: 2, salidas: 0, neto: 2 })
  assert.match(data.movimientos[0].detail, /AUR0000000000001/)
})

test('la venta descuenta con la fecha de la venta y el detalle del cliente', () => {
  const data = construirKardexDemo({
    producto: { ...PRODUCTO, stock: 0 },
    unidades: [unidad({ status: 'SOLD', sale: { orderNumber: 'MOB-001', soldAt: hace(2).toISOString(), customerName: 'María González' } })],
  })
  const venta = data.movimientos.find((movimiento) => movimiento.kind === 'VENTA')
  assert.equal(venta.delta, -1)
  assert.equal(venta.label, 'Venta MOB-001')
  assert.match(venta.detail, /María González/)
  assert.equal(data.cierre, 0)
})

test('reservada, en revisión y en tránsito quedan fuera del stock disponible', () => {
  const unidades = [
    unidad(),
    unidad({ id: 'u2', status: 'RESERVED', reservationCustomer: 'Lucía Fernández', reservedUntil: hace(-1).toISOString() }),
    unidad({ id: 'u3', status: 'DEFECTIVE' }),
    unidad({ id: 'u4', status: 'IN_TRANSIT' }),
  ]
  const data = construirKardexDemo({ producto: { ...PRODUCTO, stock: 1 }, unidades })
  const etiquetas = data.movimientos.map((movimiento) => movimiento.label)
  assert.ok(etiquetas.includes('Unidad reservada'))
  assert.ok(etiquetas.includes('Unidad en revisión'))
  assert.ok(etiquetas.includes('Unidad en tránsito'))
  assert.equal(data.saldoInicial, 0)
  assert.equal(data.cierre, 1)
})

test('la baja descuenta la unidad y el alta con proveedor se muestra como compra', () => {
  const data = construirKardexDemo({
    producto: { ...PRODUCTO, stock: 0 },
    unidades: [unidad({ supplierName: 'Importadora Tecnológica S.A. ', removedAt: hace(1).toISOString(), removedReason: 'Dañada' })],
  })
  assert.equal(data.movimientos[0].kind, 'COMPRA')
  assert.match(data.movimientos[0].detail, /Importadora/)
  const baja = data.movimientos.find((movimiento) => movimiento.kind === 'AJUSTE')
  assert.equal(baja.label, 'Unidad dada de baja')
  assert.equal(baja.delta, -1)
  assert.equal(data.cierre, 0)
})

test('el traslado envío no recibido deja la unidad fuera de stock; al recibirlo vuelve', () => {
  const enTransito = unidad({ status: 'IN_TRANSIT' })
  const transferencia = {
    id: 't1',
    createdAt: hace(3).toISOString(),
    receivedAt: null,
    sourceBranch: { name: 'Casa Central' },
    destinationBranch: { name: 'Villa Morra' },
    dispatchedBy: { name: 'Hernán Acosta' },
    lines: [{ productId: 'p1', quantity: 1, serials: [enTransito.serial] }],
  }
  const enViaje = construirKardexDemo({ producto: { ...PRODUCTO, stock: 0 }, unidades: [enTransito], transferencias: [transferencia] })
  assert.equal(enViaje.movimientos.filter((movimiento) => movimiento.kind === 'TRANSFERENCIA').length, 1)
  assert.equal(enViaje.cierre, 0)

  const recibida = construirKardexDemo({
    producto: { ...PRODUCTO, stock: 1 },
    unidades: [unidad()],
    transferencias: [{ ...transferencia, receivedAt: hace(1).toISOString(), receivedBy: { name: 'Diego López' } }],
  })
  assert.equal(recibida.movimientos.filter((movimiento) => movimiento.kind === 'TRANSFERENCIA').length, 2)
  assert.equal(recibida.saldoInicial, 0)
  assert.equal(recibida.cierre, 1)
})

test('el rango recorta movimientos y arranca con el saldo a esa fecha', () => {
  const unidades = [
    unidad({ createdAt: hace(10).toISOString() }),
    unidad({ id: 'u2', serial: 'AUR2', status: 'SOLD', createdAt: hace(9).toISOString(), sale: { soldAt: hace(2).toISOString(), orderNumber: 'MOB-9' } }),
  ]
  const data = construirKardexDemo({
    producto: { ...PRODUCTO, stock: 1 },
    unidades,
    desde: hace(5).toISOString(),
  })
  assert.equal(data.movimientos.length, 1)
  assert.equal(data.movimientos[0].kind, 'VENTA')
  assert.equal(data.saldoInicial, 2)
  assert.equal(data.cierre, 1)
})

test('ignora unidades de otro producto y no inventa movimientos sin unidad', () => {
  const eventos = eventosDemo({ producto: PRODUCTO, unidades: [unidad({ productId: 'otro' })] })
  assert.deepEqual(eventos, [])
  const data = construirKardexDemo({ producto: { ...PRODUCTO, stock: 4 }, unidades: [] })
  assert.equal(data.movimientos.length, 0)
  assert.equal(data.saldoInicial, 4)
  assert.equal(data.cierre, 4)
})
