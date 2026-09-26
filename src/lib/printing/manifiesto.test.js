import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosManifiesto, etiquetasDeLote } from './manifiesto.js'
import { ticketEtiquetasLote, ticketManifiesto } from './tickets.js'

// Forma real de `GET /api/supply/shipments/[id]/manifest` (INV, F4):
// `manifiestoEnvio` + proveedor.
const MANIFIESTO = {
  code: 'ENV-CDE-ASU-0021',
  origen: 'CDE',
  destino: 'Casa Central',
  metodo: 'BUS',
  metodoLabel: 'Bus',
  empresa: 'Expreso del Este',
  conductor: 'Ramón Giménez',
  guia: 'A003526979',
  responsable: 'Lucía Benítez',
  estado: 'EN_TRANSITO',
  salida: '2026-09-25T11:00:00Z',
  eta: '2026-09-27T00:00:00Z',
  llegada: null,
  compra: 'COM-CDE-0048',
  proveedor: 'Mayorista Apple PY',
  unidades: 4,
  conImei: 2,
  pendientes: 2,
  lineas: [
    { producto: 'iPhone 15 Pro Max', capacidad: '256 GB', condicion: 'USED', cantidad: 3, imeis: ['351500000000004', '351500000000012'], pendientes: 1 },
    { producto: 'AirPods Pro 2', capacidad: '', condicion: 'NEW', cantidad: 1, imeis: [], pendientes: 1 },
  ],
  enlace: 'https://app.moboss.online/envio/ENV-CDE-ASU-0021',
  notas: 'Lote incompleto: el resto viaja la semana que viene.',
}

test('el manifiesto normaliza recorrido, transporte y resumen', () => {
  const datos = datosManifiesto(MANIFIESTO, { emisor: 'Móvil Center (demo)', ahora: new Date('2026-09-26T10:00:00Z') })
  assert.equal(datos.code, 'ENV-CDE-ASU-0021')
  assert.equal(datos.estado, 'En tránsito')
  assert.equal(datos.recorrido, 'CDE → Casa Central')
  assert.equal(datos.metodo, 'Bus')
  assert.equal(datos.empresa, 'Expreso del Este')
  assert.equal(datos.conductor, 'Ramón Giménez')
  assert.equal(datos.guia, 'A003526979')
  assert.equal(datos.responsable, 'Lucía Benítez')
  assert.equal(datos.proveedor, 'Mayorista Apple PY')
  assert.deepEqual(datos.resumen, { lineas: 2, unidades: 4, conImei: 2, pendientes: 2 })
  assert.equal(datos.lineas[0].condicion, 'Seminuevo')
  assert.equal(datos.lineas[0].pendientes, 1)
  assert.equal(datos.lineas[1].condicion, 'Nuevo')
  // Sin enlace explícito no hay QR (regla dura) aunque el backend lo proponga.
  assert.equal(datos.enlace, '')
  assert.equal(datos.enlacePublico, false)
})

test('las etiquetas del lote numeran N de M con el código del envío', () => {
  const etiquetas = etiquetasDeLote(MANIFIESTO)
  assert.equal(etiquetas.length, 4)
  assert.deepEqual(etiquetas.map((fila) => fila.n), [1, 2, 3, 4])
  assert.equal(etiquetas.every((fila) => fila.total === 4), true)
  assert.equal(etiquetas.every((fila) => fila.lote === 'ENV-CDE-ASU-0021'), true)
  assert.equal(etiquetas[0].imei, '351500000000004')
  assert.equal(etiquetas[0].pendiente, false)
  assert.equal(etiquetas[2].imei, null)
  assert.equal(etiquetas[2].pendiente, true)
  assert.equal(etiquetas[3].producto, 'AirPods Pro 2')
  // El ticket de etiquetas las imprime con su posición y su lote.
  const texto = ticketEtiquetasLote(etiquetas, { ancho: 80 }).lineas().join('\n')
  assert.match(texto, /1 de 4/)
  assert.match(texto, /3 de 4/)
  assert.match(texto, /PENDIENTE/)
  assert.match(texto, /Lote +ENV-CDE-ASU-0021/)
  assert.match(texto, /\[BARRA\] ENV-CDE-ASU-0021/)
})

test('el ticket del manifiesto trae IMEI, pendientes, firmas y barras', () => {
  const datos = datosManifiesto(MANIFIESTO, { emisor: 'Móvil Center (demo)' })
  const texto = ticketManifiesto(datos, { ancho: 80 }).lineas().join('\n')
  assert.match(texto, /ENV-CDE-ASU-0021/)
  assert.match(texto, /MANIFIESTO DE ENVÍO/)
  assert.match(texto, /CDE -> Casa Central/)
  assert.match(texto, /Conductor +Ramón Giménez/)
  assert.match(texto, /iPhone 15 Pro Max · 256 GB x3/)
  assert.match(texto, /351500000000004/)
  assert.match(texto, /1 unidad\(es\) sin IMEI/)
  assert.match(texto, /Despachó \/ responsable:/)
  assert.match(texto, /Recibió el transportista:/)
  assert.match(texto, /\[BARRA\] ENV-CDE-ASU-0021/)
  assert.match(texto, /Escaneá para abrir el manifiesto del lote\./)
  const angosto = ticketManifiesto(datos, { ancho: 58 }).lineas().join('\n')
  assert.match(angosto, /MANIFIESTO DE ENVÍO/)
})

test('con enlace el manifiesto imprime el QR de recepción', () => {
  const datos = datosManifiesto(MANIFIESTO, { enlace: MANIFIESTO.enlace })
  const texto = ticketManifiesto(datos, { ancho: 80 }).lineas().join('\n')
  assert.equal(datos.enlacePublico, true)
  assert.match(texto, /\[QR\] https:\/\/app\.moboss\.online/)
  assert.doesNotMatch(texto, /\[BARRA\]/)
})

test('un manifiesto vacío no rompe', () => {
  const datos = datosManifiesto({})
  assert.deepEqual(datos.lineas, [])
  assert.deepEqual(datos.resumen, { lineas: 0, unidades: 0, conImei: 0, pendientes: 0 })
  assert.deepEqual(etiquetasDeLote({}), [])
  const texto = ticketManifiesto(datos).lineas().join('\n')
  assert.match(texto, /MANIFIESTO DE ENVÍO/)
  assert.match(texto, /El lote no lleva unidades\./)
})
