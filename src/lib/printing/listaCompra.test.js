import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosListaCompra, ORIGENES_LISTA, PRIORIDADES_LISTA } from './listaCompra.js'
import { ticketListaCompra } from './tickets.js'

// Forma real de `GET /api/supply/purchases` (INV): la compra con sus líneas;
// el nombre del producto y la prioridad/origen de la necesidad los pasa el
// panel (productos + necesidades), como documenta docs/LISTA-COMPRA.md.
const COMPRA = {
  id: 'com-1',
  code: 'COM-CDE-0048',
  status: 'COMPRADA',
  supplierName: 'Mayorista Apple PY',
  reference: 'Factura 001-002',
  notes: 'Retirar antes del mediodía',
  branch: { id: 'b-1', name: 'Casa Central' },
  lines: [
    { id: 'l-1', productId: 'p-pro', condition: 'USED', quantity: 2, needId: 'n-1', serials: [{ serial: '351500000000004' }] },
    { id: 'l-2', productId: 'p-pro', condition: 'USED', quantity: 1, needId: 'n-2', serials: [] },
    { id: 'l-3', productId: 'p-air', condition: 'NEW', quantity: 5, needId: null, serials: [] },
  ],
}

const PRODUCTOS = [
  { id: 'p-pro', name: 'iPhone 15 Pro Max', capacity: '256 GB', color: 'Titanio Natural' },
  { id: 'p-air', name: 'AirPods Pro 2', color: 'Blanco' },
]

const NECESIDADES = [
  { id: 'n-1', priority: 'URGENTE', source: 'SALE_NO_STOCK', promisedAt: '2026-09-27T00:00:00Z', orderNumber: 'PV-000123' },
  { id: 'n-2', priority: 'NORMAL', source: 'BELOW_REORDER' },
]

const OPCIONES = { productos: PRODUCTOS, necesidades: NECESIDADES, comprador: 'Lucía Benítez', origen: 'CDE', ahora: new Date('2026-09-26T12:00:00Z') }

test('la lista agrupa por producto y condición con cantidad, prioridad y contexto', () => {
  const datos = datosListaCompra(COMPRA, OPCIONES)
  assert.equal(datos.code, 'COM-CDE-0048')
  assert.equal(datos.estado, 'Comprada')
  assert.equal(datos.recorrido, 'CDE → Casa Central')
  assert.equal(datos.comprador, 'Lucía Benítez')
  assert.equal(datos.proveedor, 'Mayorista Apple PY')
  assert.equal(datos.referencia, 'Factura 001-002')
  assert.equal(datos.notas, 'Retirar antes del mediodía')

  assert.equal(datos.lineas.length, 2)
  // La prioridad más alta manda y la línea se ordena primero.
  const pro = datos.lineas[0]
  assert.equal(pro.producto, 'iPhone 15 Pro Max')
  assert.equal(pro.variante, '256 GB · Titanio Natural')
  assert.equal(pro.condicion, 'Seminuevo')
  assert.equal(pro.cantidad, 3)
  assert.deepEqual(pro.prioridad, { codigo: 'URGENTE', etiqueta: 'Urgente' })
  assert.deepEqual(pro.origenes, [ORIGENES_LISTA.SALE_NO_STOCK, ORIGENES_LISTA.BELOW_REORDER])
  assert.equal(pro.prometidaTexto.length > 0, true)
  assert.deepEqual(pro.pedidos, ['PV-000123'])
  assert.equal(pro.conImei, 1)
  assert.equal(pro.pendientes, 2)

  const aire = datos.lineas[1]
  assert.equal(aire.producto, 'AirPods Pro 2')
  assert.equal(aire.prioridad, null)
  assert.deepEqual(aire.origenes, [ORIGENES_LISTA.LIBRE], 'sin necesidad es reposición libre')
  assert.equal(aire.pendientes, 5)
})

test('el resumen cuenta líneas, unidades, IMEI y urgencias', () => {
  const datos = datosListaCompra(COMPRA, OPCIONES)
  assert.deepEqual(datos.resumen, { lineas: 2, unidades: 8, conImei: 1, pendientes: 7, urgentes: 1 })
})

test('acepta prioridad en la línea (API futura) y cae al id sin catálogo', () => {
  const compra = {
    ...COMPRA,
    lines: [{ id: 'l-1', productId: 'p-x', condition: 'NEW', quantity: 1, needId: null, priority: 'ALTA', source: 'MANUAL', serials: [] }],
  }
  const datos = datosListaCompra(compra, { comprador: 'Dario' })
  assert.equal(datos.lineas[0].producto, 'p-x')
  assert.deepEqual(datos.lineas[0].prioridad, { codigo: 'ALTA', etiqueta: PRIORIDADES_LISTA.ALTA })
  assert.deepEqual(datos.lineas[0].origenes, [ORIGENES_LISTA.MANUAL])
})

test('una compra vacía no rompe', () => {
  const datos = datosListaCompra({})
  assert.deepEqual(datos.lineas, [])
  assert.deepEqual(datos.resumen, { lineas: 0, unidades: 0, conImei: 0, pendientes: 0, urgentes: 0 })
  const texto = ticketListaCompra(datos).lineas().join('\n')
  assert.match(texto, /LISTA DE COMPRA/)
  assert.match(texto, /Sin productos en la compra\./)
})

test('el ticket ESC/POS lista con casillero, prioridad, IMEI y el fallback en barras', () => {
  const datos = datosListaCompra(COMPRA, OPCIONES)
  const texto = ticketListaCompra(datos, { ancho: 80 }).lineas().join('\n')
  assert.match(texto, /COM-CDE-0048/)
  assert.match(texto, /CDE -> Casa Central/)
  assert.match(texto, /Comprador +Lucía Benítez/)
  assert.match(texto, /\[ \] iPhone 15 Pro Max/) // el nombre largo envuelve en el rollo
  assert.match(texto, /Titanio/)
  assert.match(texto, /3 u · Seminuevo/)
  assert.match(texto, /Prioridad Urgente/)
  assert.match(texto, /Venta sin stock/)
  assert.match(texto, /IMEI: 1 cargado\(s\) · 2 pendiente\(s\)/)
  assert.match(texto, /Compró \/ control:/)
  assert.match(texto, /\[BARRA\] COM-CDE-0048/)
  assert.match(texto, /Escaneá para abrir el panel de la compra\./)
  const angosto = ticketListaCompra(datos, { ancho: 58 }).lineas().join('\n')
  assert.match(angosto, /LISTA DE COMPRA/)
})

test('con enlace público el ticket imprime el QR al panel', () => {
  const datos = datosListaCompra(COMPRA, { ...OPCIONES, enlace: 'https://app.moboss.online/abastecimiento/compras/com-1' })
  const texto = ticketListaCompra(datos, { ancho: 80 }).lineas().join('\n')
  assert.equal(datos.enlacePublico, true)
  assert.match(texto, /\[QR\] https:\/\/app\.moboss\.online/)
  assert.doesNotMatch(texto, /\[BARRA\]/)
})
