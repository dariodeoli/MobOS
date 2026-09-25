import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextoEtiquetaLote, datosEtiquetaLote } from './etiquetaLote.js'
import { ticketEtiquetasLote } from './tickets.js'

// Forma real de `GET /api/supply/purchases/[id]/labels`: una etiqueta por unidad
// con el IMEI cargado o `pendiente`, más la compra y el resumen.
const ETIQUETA = {
  n: 3,
  total: 12,
  producto: 'iPhone 15 Pro Max',
  capacidad: '256 GB',
  condicion: 'USED',
  imei: '351500000000004',
  pendiente: false,
  compra: 'COM-CDE-0048',
  referencia: 'Factura 001-002',
  pedido: 'PV-000123',
  destino: 'Casa Central',
  lote: 'ENV-CDE-ASU-0021',
}

const COMPRA = { id: 'com-1', code: 'COM-CDE-0048', referencia: null, destino: 'Casa Central' }

test('la etiqueta del lote normaliza posición, variante, contexto y código de barras', () => {
  const datos = datosEtiquetaLote(ETIQUETA, { compra: COMPRA })
  assert.equal(datos.posicion, '3 de 12')
  assert.equal(datos.producto, 'iPhone 15 Pro Max')
  assert.equal(datos.capacidad, '256 GB')
  assert.equal(datos.condicion, 'Seminuevo')
  assert.equal(datos.imei, '351500000000004')
  assert.equal(datos.pendiente, false)
  assert.equal(datos.codigo, '351500000000004')
  assert.equal(datos.codigoRotulo, 'IMEI')
  assert.equal(datos.pedido, 'PV-000123')
  assert.equal(datos.destino, 'Casa Central')
  assert.equal(datos.lote, 'ENV-CDE-ASU-0021')
  assert.equal(contextoEtiquetaLote(datos), '256 GB · Seminuevo')
})

test('sin IMEI el código cae al lote (o a la compra) y la etiqueta lo marca pendiente', () => {
  const sinImei = datosEtiquetaLote({ ...ETIQUETA, imei: null, pendiente: true })
  assert.equal(sinImei.pendiente, true)
  assert.equal(sinImei.codigo, 'ENV-CDE-ASU-0021')
  assert.equal(sinImei.codigoRotulo, 'LOTE')

  const sinLote = datosEtiquetaLote({ ...ETIQUETA, imei: null, pendiente: true, lote: null }, { compra: COMPRA })
  assert.equal(sinLote.codigo, 'COM-CDE-0048')
  assert.equal(sinLote.codigoRotulo, 'COMPRA')
  assert.equal(sinLote.destino, 'Casa Central', 'el destino cae a la compra')
})

test('una etiqueta incompleta no rompe', () => {
  const datos = datosEtiquetaLote({})
  assert.equal(datos.posicion, '1 de 1')
  assert.equal(datos.producto, 'Producto')
  assert.equal(datos.pendiente, true)
  assert.equal(datos.codigo, '')
  assert.equal(contextoEtiquetaLote(datos), '')
})

test('el ticket ESC/POS arma una etiqueta por unidad con su código', () => {
  const etiquetas = [
    ETIQUETA,
    { ...ETIQUETA, n: 4, imei: null, pendiente: true },
  ]
  const texto = ticketEtiquetasLote(etiquetas, { ancho: 80 }).lineas().join('\n')
  assert.match(texto, /ETIQUETA DE LOTE/)
  assert.match(texto, /iPhone 15 Pro Max/)
  assert.match(texto, /256 GB · Seminuevo/)
  assert.match(texto, /3 de 12/)
  assert.match(texto, /4 de 12/)
  assert.match(texto, /351500000000004/)
  assert.match(texto, /PENDIENTE/)
  assert.match(texto, /Se carga antes de despachar/)
  assert.match(texto, /Compra +COM-CDE-0048/)
  assert.match(texto, /Pedido +PV-000123/)
  assert.match(texto, /Destino +Casa Central/)
  assert.match(texto, /Lote +ENV-CDE-ASU-0021/)
  assert.match(texto, /\[BARRA\] 351500000000004/)
  assert.match(texto, /\[BARRA\] ENV-CDE-ASU-0021/)
  // Dos etiquetas = dos cortes (una por unidad).
  assert.equal((texto.match(/\[CORTE\]/g) || []).length, 2)

  const angosto = ticketEtiquetasLote([ETIQUETA], { ancho: 58 }).lineas().join('\n')
  assert.match(angosto, /3 de 12/)
})
