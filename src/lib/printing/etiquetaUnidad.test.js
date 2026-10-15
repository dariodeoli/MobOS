import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextoEtiquetaUnidad, datosEtiquetaUnidad, identificadorDe, modeloDe } from './etiquetaUnidad.js'

const UNIDAD = {
  serial: '356789012345678',
  condition: 'USED',
  batteryHealth: 89,
  supplierName: 'Proveedor XYZ',
  supplier: { id: 's1', name: 'Proveedor XYZ', code: 'PX' },
  location: { code: 'D2', name: 'Depósito 2' },
  product: { name: 'iPhone 15 Pro 256GB Titanio', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio' },
}

test('la etiqueta arma modelo, identificador, serial y código de unidad (#220)', () => {
  const datos = datosEtiquetaUnidad(UNIDAD, { base: 'https://app.moboss.online' })
  assert.equal(datos.modelo, 'iPhone 15 Pro · 256GB · Titanio')
  assert.equal(datos.identificador, '5678')
  assert.equal(datos.serial, '356789012345678')
  assert.equal(datos.codigo, 'MOBOS:356789012345678')
  assert.equal(datos.enlace, 'https://app.moboss.online/u/356789012345678')
  assert.equal(contextoEtiquetaUnidad(datos), 'Seminuevo · Batería 89% · Ubicación: D2 · Depósito 2 · Proveedor: PX')
  // #400: el nombre real del proveedor nunca se imprime.
  assert.equal(JSON.stringify(datos).includes('Proveedor XYZ'), false)
})

test('no repite capacidad ni color cuando el modelo ya los trae', () => {
  assert.equal(modeloDe({ model: 'iPhone 14 Pro 256GB Plata', capacity: '256GB', color: 'Plata' }), 'iPhone 14 Pro 256GB Plata')
  assert.equal(modeloDe({ name: 'Cargador USB-C' }), 'Cargador USB-C')
  assert.equal(modeloDe({}), 'Producto')
})

test('el identificador usa el final del serial y cae a ---- sin serial', () => {
  assert.equal(identificadorDe('SN-0001'), '0001')
  assert.equal(identificadorDe('356789012345678'), '5678')
  assert.equal(identificadorDe(''), '----')
  assert.equal(identificadorDe(null), '----')
})

test('sin serial no hay QR ni código de unidad', () => {
  const datos = datosEtiquetaUnidad({ product: { name: 'Producto sin serial' } }, { base: 'https://app.moboss.online' })
  assert.equal(datos.serial, '')
  assert.equal(datos.codigo, '')
  assert.equal(datos.enlace, '')
  assert.equal(datos.identificador, '----')
})

test('etiqueta de unidad conserva ciclos, incluido cero, sin inventar datos ausentes (#400)', () => {
  assert.equal(datosEtiquetaUnidad({ ...UNIDAD, batteryCycles: 61 }).bateria, 'Batería 89% · 61 ciclos')
  assert.equal(datosEtiquetaUnidad({ ...UNIDAD, batteryCycles: 0 }).bateria, 'Batería 89% · 0 ciclos')
  assert.equal(datosEtiquetaUnidad({ ...UNIDAD, batteryHealth: null, batteryCycles: 61 }).bateria, '61 ciclos')
  for (const value of [null, undefined, '', 'no', -1]) assert.equal(datosEtiquetaUnidad({ ...UNIDAD, batteryCycles: value }).bateria, 'Batería 89%')
})
