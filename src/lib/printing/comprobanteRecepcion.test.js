import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosComprobanteRecepcion, resumenRecepcion } from './comprobanteRecepcion.js'
import { ticketComprobanteRecepcion } from './tickets.js'

// Forma real de `GET /api/supply/receptions?id=`: la recepción con su envío
// (compra + líneas + items esperados) y los items escaneados con resultado.
const RECEPCION = {
  id: 'rec-1',
  status: 'CONFIRMADA',
  createdAt: '2026-09-24T18:10:00.000Z',
  receivedAt: '2026-09-24T18:40:00.000Z',
  location: { id: 'loc-1', name: 'Depósito 1', code: 'D1' },
  receivedBy: { id: 'u-1', name: 'Lucía Benítez' },
  notes: 'El iPhone faltante viaja en el próximo lote.',
  shipment: {
    id: 'ship-1',
    code: 'ENV-CDE-ASU-0021',
    origin: 'CDE',
    method: 'BUS',
    status: 'CON_INCIDENCIA',
    destinationBranch: { id: 'b-1', name: 'Casa Central' },
    purchase: {
      code: 'COM-CDE-0048',
      supplierName: 'Mayorista Apple PY',
      lines: [
        { id: 'l-1', productId: 'p-iphone', condition: 'USED', quantity: 2 },
        { id: 'l-2', productId: 'p-airpods', condition: 'NEW', quantity: 1 },
      ],
    },
    items: [
      { id: 'si-1', serial: '351500000000004', productId: 'p-iphone', lineId: 'l-1' },
      { id: 'si-2', serial: '351500000000012', productId: 'p-iphone', lineId: 'l-1' },
      { id: 'si-3', serial: 'AUR0001000000003', productId: 'p-airpods', lineId: 'l-2' },
    ],
  },
  items: [
    { id: 'ri-1', shipmentItemId: 'si-1', serial: '351500000000004', productId: 'p-iphone', resultado: 'RECIBIDO', nota: null },
    { id: 'ri-2', shipmentItemId: 'si-2', serial: '351500000000012', productId: 'p-iphone', resultado: 'DANADO', nota: 'Pantalla rayada en el traslado' },
    { id: 'ri-3', shipmentItemId: null, serial: '359999999999995', productId: 'p-airpods', resultado: 'SOBRANTE', nota: 'No figuraba en el manifiesto' },
    { id: 'ri-4', shipmentItemId: 'si-3', serial: 'AUR0001000000003', productId: 'p-airpods', resultado: 'FALTANTE', nota: 'Quedó en CDE' },
  ],
}

const PRODUCTOS = [
  { id: 'p-iphone', name: 'iPhone 15 Pro Max', capacity: '256 GB', color: 'Titanio Natural' },
  { id: 'p-airpods', name: 'AirPods Pro 2', color: 'Blanco' },
]

test('resumenRecepcion cuenta por resultado y ignora lo desconocido', () => {
  assert.deepEqual(resumenRecepcion(), { RECIBIDO: 0, FALTANTE: 0, SOBRANTE: 0, DANADO: 0, INCORRECTO: 0 })
  const resumen = resumenRecepcion([{ resultado: 'RECIBIDO' }, { resultado: 'danado' }, { resultado: 'OTRO' }])
  assert.equal(resumen.RECIBIDO, 1)
  assert.equal(resumen.DANADO, 1)
  assert.equal(resumen.FALTANTE, 0)
})

test('el comprobante concilia esperado vs recibido por línea con incidencias', () => {
  const datos = datosComprobanteRecepcion(RECEPCION, { productos: PRODUCTOS, emisor: 'Móvil Center', ahora: new Date('2026-09-24T19:00:00.000Z') })

  assert.equal(datos.compra, 'COM-CDE-0048')
  assert.equal(datos.envio, 'ENV-CDE-ASU-0021')
  assert.equal(datos.proveedor, 'Mayorista Apple PY')
  assert.equal(datos.origen, 'CDE')
  assert.equal(datos.destino, 'Casa Central')
  assert.equal(datos.metodo, 'Bus')
  assert.equal(datos.deposito, 'D1 · Depósito 1')
  assert.equal(datos.usuario, 'Lucía Benítez')
  assert.equal(datos.estado.etiquetaLote, 'Con incidencias')
  assert.equal(datos.estado.etiqueta, 'Confirmada')
  assert.equal(datos.notas, 'El iPhone faltante viaja en el próximo lote.')
  assert.equal(datos.recibidoEl, '2026-09-24T18:40:00.000Z')
  assert.equal(datos.fechaEmision.length > 0, true)

  assert.equal(datos.lineas.length, 2)
  const iphone = datos.lineas.find((linea) => linea.producto === 'iPhone 15 Pro Max')
  assert.equal(iphone.variante, '256 GB · Titanio Natural')
  assert.equal(iphone.condicion, 'Seminuevo')
  assert.equal(iphone.esperado, 2)
  assert.equal(iphone.recibido, 1)
  assert.equal(iphone.danado, 1)
  assert.equal(iphone.faltante, 0)
  assert.deepEqual(iphone.recibidos, ['351500000000004'])

  const airpods = datos.lineas.find((linea) => linea.producto === 'AirPods Pro 2')
  assert.equal(airpods.esperado, 1)
  assert.equal(airpods.recibido, 0)
  assert.equal(airpods.faltante, 1)
  assert.equal(airpods.sobrante, 1)

  assert.deepEqual(datos.resumen, { esperadas: 3, recibidas: 1, faltantes: 1, sobrantes: 1, danados: 1, incorrectos: 0 })
  assert.equal(datos.incidencias.length, 3)
  assert.equal(datos.incidencias.some((fila) => fila.etiqueta === 'Dañado' && fila.serial === '351500000000012' && fila.nota.includes('rayada')), true)
  assert.equal(datos.incidencias.some((fila) => fila.etiqueta === 'Faltante' && fila.producto === 'AirPods Pro 2'), true)
  assert.equal(datos.incidencias.some((fila) => fila.etiqueta === 'Sobrante' && fila.serial === '359999999999995'), true)
  assert.equal(datos.enlacePublico, false)
})

test('sin nombre de producto la línea cae al id y el sobre cae a su línea', () => {
  const datos = datosComprobanteRecepcion({ recepcion: RECEPCION })
  assert.equal(datos.lineas[0].producto, 'p-iphone')
  assert.equal(datos.lineas[1].producto, 'p-airpods')
  assert.equal(datos.resumen.sobrantes, 1)
})

test('sin líneas de compra agrupa por producto esperado', () => {
  const sinLineas = {
    ...RECEPCION,
    shipment: { ...RECEPCION.shipment, purchase: { code: 'COM-1', lines: [] } },
  }
  const datos = datosComprobanteRecepcion(sinLineas, { productos: PRODUCTOS })
  assert.equal(datos.lineas.length, 2)
  assert.equal(datos.lineas.find((linea) => linea.producto === 'iPhone 15 Pro Max').esperado, 2)
  assert.equal(datos.lineas.find((linea) => linea.producto === 'AirPods Pro 2').faltante, 1)
})

test('una recepción vacía no rompe el comprobante', () => {
  const datos = datosComprobanteRecepcion({})
  assert.deepEqual(datos.lineas, [])
  assert.deepEqual(datos.incidencias, [])
  assert.deepEqual(datos.resumen, { esperadas: 0, recibidas: 0, faltantes: 0, sobrantes: 0, danados: 0, incorrectos: 0 })
  const lineas = ticketComprobanteRecepcion(datos).lineas().join('\n')
  assert.match(lineas, /COMPROBANTE DE RECEPCIÓN/)
  assert.match(lineas, /Sin unidades registradas/)
})

test('el ticket imprime códigos, depósito, faltantes y el fallback en barras', () => {
  const datos = datosComprobanteRecepcion(RECEPCION, { productos: PRODUCTOS, emisor: 'Móvil Center' })
  const texto = ticketComprobanteRecepcion(datos, { ancho: 80 }).lineas().join('\n')
  assert.match(texto, /Móvil Center/)
  assert.match(texto, /ENV-CDE-ASU-0021 · COM-CDE-0048/)
  assert.match(texto, /Depósito +D1 · Depósito 1/)
  assert.match(texto, /Recibió +Lucía Benítez/)
  assert.match(texto, /iPhone 15 Pro Max · 256 GB · Titanio Natural/)
  assert.match(texto, /esperado 2 · recibido 1/)
  assert.match(texto, /faltan 1/)
  assert.match(texto, /Dañado: 351500000000012/)
  assert.match(texto, /Pantalla rayada en el traslado/)
  assert.match(texto, /\[BARRA\] ENV-CDE-ASU-0021/)
  assert.match(texto, /Escaneá para abrir el panel de la compra\./)
  // En 58 mm no se rompe ni se sale del ancho de la columna.
  const angosto = ticketComprobanteRecepcion(datos, { ancho: 58 }).lineas().join('\n')
  assert.match(angosto, /Faltantes/)
})

test('con enlace público el ticket imprime el QR al panel', () => {
  const datos = datosComprobanteRecepcion(RECEPCION, { productos: PRODUCTOS, enlace: 'https://app.moboss.online/abastecimiento/compras/com-1' })
  const texto = ticketComprobanteRecepcion(datos, { ancho: 80 }).lineas().join('\n')
  assert.equal(datos.enlacePublico, true)
  assert.match(texto, /\[QR\] https:\/\/app\.moboss\.online/)
  assert.match(texto, /PANEL DE LA COMPRA/)
  assert.doesNotMatch(texto, /\[BARRA\]/)
})
