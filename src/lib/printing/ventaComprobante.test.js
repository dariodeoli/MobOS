// #318: el comprobante sale de la venta real. Estos tests fijan la resolución
// de empresa, cliente, número, artículos y totales en las tres formas que
// circulan por la app (API, fila del listado y venta legacy del demo).

import assert from 'node:assert/strict'
import test from 'node:test'
import { clienteDeVenta, documentoComprobante, itemsDeVenta, normalizarItem } from './ventaComprobante.js'

const VENTA_DEMO = {
  id: 'demo-venta-extra-1',
  // La fila del listado expone el número que se ve en la ficha; la venta cruda
  // solo trae el id interno. El comprobante imprime lo mismo que la pantalla.
  number: 'demo-venta-extra-1',
  cliente: 'María González',
  clienteId: 'demo-cliente-maria',
  productoId: 'demo-iphone-15-pro-max-256-titanio',
  productoNombre: 'iPhone 15 Pro Max 256GB Titanio Natural',
  precio: 7250000,
  fecha: '2026-10-02',
  creadoEn: '2026-10-02T10:30:00',
  pagos: [
    { id: 'pago-1', medioPago: 'DINERO', monto: 3000000 },
    { id: 'pago-2', medioPago: 'TRANSFERENCIA', monto: 4250000 },
  ],
  totalPagado: 7250000,
}

test('la venta legacy del demo resuelve empresa, cliente, número y artículos', () => {
  const documento = documentoComprobante(VENTA_DEMO, {
    empresa: { id: 'mobos-demo', nombre: 'Aurora Móviles S.A.' },
    sucursal: { id: 'mobos-demo-central', nombre: 'Casa Central' },
    vendedor: 'Diego López',
  })
  assert.equal(documento.tenant?.name, 'Aurora Móviles S.A.')
  assert.equal(documento.branch?.name, 'Casa Central')
  assert.equal(documento.seller?.name, 'Diego López')
  assert.equal(documento.customer.name, 'María González')
  assert.equal(documento.orderNumber, 'demo-venta-extra-1', 'el número que muestra la pantalla se imprime igual')
  assert.equal(documento.creadoEn, '2026-10-02T10:30:00', 'la fecha de la fila se unifica para el papel')
  assert.equal(documento.items.length, 1)
  assert.equal(documento.items[0].description, 'iPhone 15 Pro Max 256GB Titanio Natural')
  assert.equal(documento.items[0].quantity, 1)
  assert.equal(documento.items[0].unitPricePyg, 7250000)
  assert.equal(documento.items[0].totalPyg, 7250000)
  assert.equal(documento.subtotalPyg, 7250000)
  assert.equal(documento.totalPyg, 7250000)
  assert.equal(documento.payments.length, 2)
})

test('la orden completa del API no se altera y conserva ficha, empresa e ítems', () => {
  const orden = {
    id: 'orden-1',
    orderNumber: 'MOB-#0042',
    totalPyg: 120000,
    subtotalPyg: 100000,
    deliveryPyg: 20000,
    discountPyg: 0,
    tenant: { name: 'Móvil Center', ruc: '80012345-0' },
    branch: { name: 'Casa Central' },
    seller: { name: 'Ana' },
    customer: { id: 'c-1', name: 'Juan Pérez', phone: '981111222', document: '1234567' },
    items: [{ id: 'i-1', description: 'Funda', quantity: 2, unitPricePyg: 50000, totalPyg: 100000 }],
    payments: [{ id: 'p-1', method: 'CASH', amountPyg: 120000, status: 'CONFIRMED' }],
  }
  const documento = documentoComprobante(orden, { empresa: { nombre: 'Otra empresa' } })
  assert.equal(documento.tenant.name, 'Móvil Center', 'el tenant del pedido manda sobre el contexto')
  assert.equal(documento.customer.name, 'Juan Pérez')
  assert.equal(documento.customer.document, '1234567')
  assert.equal(documento.orderNumber, 'MOB-#0042')
  assert.deepEqual(documento.items, orden.items, 'los ítems reales pasan tal cual')
  assert.equal(documento.totalPyg, 120000)
  assert.equal(documento.subtotalPyg, 100000)
})

test('la fila del listado completa los artículos con las líneas locales del mismo pedido', () => {
  // Proyección del vendedor: cliente como string, número y total, sin ítems.
  const fila = {
    id: 'demo-venta-extra-2',
    number: 'AUR-#0007',
    customer: 'Juan Pereira',
    customerId: 'demo-cliente-juan',
    products: 'iPhone 15 128GB Azul',
    total: 4880000,
    deliveryPyg: 30000,
    quantity: 1,
  }
  const lineas = [
    { id: 'demo-venta-extra-2', orderNumber: 'AUR-#0007', cliente: 'Juan Pereira', clienteId: 'demo-cliente-juan', productoId: 'p1', productoNombre: 'iPhone 15 128GB Azul', precio: 4850000, pagos: [{ id: 'pg-1', medioPago: 'DINERO', monto: 2000000 }] },
  ]
  const documento = documentoComprobante(fila, {
    lineas,
    productos: { p1: { nombre: 'iPhone 15 128GB Azul', sku: 'IP15-128-AZ' } },
    empresa: { nombre: 'Aurora Móviles S.A.' },
  })
  assert.equal(documento.orderNumber, 'AUR-#0007')
  assert.equal(documento.customer.name, 'Juan Pereira')
  assert.equal(documento.items.length, 1)
  assert.equal(documento.items[0].unitPricePyg, 4850000)
  assert.equal(documento.deliveryPyg, 30000)
  assert.equal(documento.subtotalPyg, 4850000)
  assert.equal(documento.totalPyg, 4880000)
  assert.equal(documento.payments.length, 1)
})

test('la ficha del cliente completa contacto sin pisar los datos del pedido', () => {
  const ficha = { id: 'demo-cliente-maria', name: 'María González', phone: '981555444', countryCode: '+595', document: '4455667' }
  const cliente = clienteDeVenta(VENTA_DEMO, ficha)
  assert.equal(cliente.name, 'María González')
  assert.equal(cliente.phone, '981555444')
  assert.equal(cliente.document, '4455667')
  const conNombreDelPedido = clienteDeVenta({ ...VENTA_DEMO, customer: { name: 'María G.' } }, ficha)
  assert.equal(conNombreDelPedido.name, 'María G.', 'el pedido manda sobre la ficha')
})

test('sin cliente real la venta anónima queda como consumidor final', () => {
  const documento = documentoComprobante({ id: 'x', total: 50000 })
  assert.equal(documento.customer.name, 'Consumidor final')
  assert.deepEqual(documento.items, [])
  assert.equal(documento.orderNumber, undefined, 'sin número real no se inventa uno')
})

test('normalizarItem deriva el unitario del total y conserva los descuentos', () => {
  const item = normalizarItem({ description: 'Cargador', quantity: 2, totalPyg: 90000, discountPyg: 10000 })
  assert.equal(item.unitPricePyg, 45000)
  assert.equal(item.totalPyg, 90000)
  assert.equal(item.discountPyg, 10000)
  const legacy = normalizarItem({ productoNombre: 'Funda', precio: 180000 })
  assert.equal(legacy.description, 'Funda')
  assert.equal(legacy.unitPricePyg, 180000)
  assert.equal(legacy.totalPyg, 180000)
})

test('los ítems del pedido ganan sobre las líneas locales', () => {
  const items = itemsDeVenta({ items: [{ description: 'Del pedido', unitPricePyg: 100 }] }, [{ productoNombre: 'Local', precio: 999 }])
  assert.equal(items.length, 1)
  assert.equal(items[0].description, 'Del pedido')
})
