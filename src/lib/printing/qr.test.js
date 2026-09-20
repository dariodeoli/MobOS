import assert from 'node:assert/strict'
import test from 'node:test'
import { baseDeApp, leerEtiqueta, leerPrueba, qrCaja, qrGarantia, qrLiquidacion, qrPedido, qrProducto, qrPrueba, qrUnidad } from './qr.js'

const BASE = 'https://app.moboss.online'

test('los QR de pedido, unidad, producto y garantía son URLs absolutas de la app', () => {
  assert.equal(qrPedido('token-vivo', BASE), `${BASE}/p/token-vivo`)
  assert.equal(qrUnidad('356789012345678', BASE), `${BASE}/u/356789012345678`)
  assert.equal(qrProducto('IPH-15-128', BASE), `${BASE}/producto/IPH-15-128`)
  assert.equal(qrGarantia('token-garantia', BASE), `${BASE}/garantia/token-garantia`)
})

test('el comprobante de comisiones apunta a la verificación pública de la app', () => {
  assert.equal(qrLiquidacion('tok-liq-1', BASE), `${BASE}/liquidacion/tok-liq-1`)
  assert.equal(qrLiquidacion('token con espacios', BASE), `${BASE}/liquidacion/token%20con%20espacios`)
  // Sin base el papel igual lleva el payload histórico del comprobante.
  assert.equal(qrLiquidacion('tok-liq-1'), 'MOBOS:LIQ:tok-liq-1')
  assert.equal(qrLiquidacion(''), '')
})

test('el cierre de caja apunta a la verificación pública de la app', () => {
  assert.equal(qrCaja('tok-caja-1', BASE), `${BASE}/caja/tok-caja-1`)
  assert.equal(qrCaja('token con espacios', BASE), `${BASE}/caja/token%20con%20espacios`)
  assert.equal(qrCaja('tok-caja-1'), 'MOBOS:CAJA:tok-caja-1')
  assert.equal(qrCaja(''), '')
})

test('la base sale del parámetro explícito y se le quita la barra final', () => {
  assert.equal(baseDeApp(`${BASE}/`), BASE)
  assert.equal(qrUnidad('ABC', `${BASE}/`), `${BASE}/u/ABC`)
  // Sin base no se inventa ruta relativa: los códigos de unidad, producto y
  // prueba caen al payload histórico que entiende el lector del local.
  assert.equal(baseDeApp(), '')
  assert.equal(qrUnidad('ABC'), 'MOBOS:ABC')
  assert.equal(qrProducto('IPH-15-128'), 'MOBOS:PROD:IPH-15-128')
  assert.equal(qrPedido(''), '')
})

test('cada valor viaja escapado en la ruta', () => {
  assert.equal(qrUnidad('serie/ con espacios', BASE), `${BASE}/u/serie%2F%20con%20espacios`)
  assert.equal(qrProducto('SKU&raro=1?', BASE), `${BASE}/producto/SKU%26raro%3D1%3F`)
})

test('la prueba arma una URL autocontenida con destino, validación, fecha y tipo', () => {
  const enlace = qrPrueba({
    destino: 'lan:192.168.1.23:9100',
    validacion: '4821',
    fecha: '2026-09-20T12:00:00.000Z',
    tipo: 'qr',
  }, BASE)
  assert.equal(
    enlace,
    `${BASE}/prueba?d=lan%3A192.168.1.23%3A9100&v=4821&f=2026-09-20T12%3A00%3A00.000Z&t=qr`,
  )
  // Los cuatro parámetros viajan siempre, en el mismo orden.
  assert.deepEqual([...new URL(enlace).searchParams.keys()], ['d', 'v', 'f', 't'])
  assert.equal(qrPrueba({ tipo: 'corta', validacion: '1234' }, ''), 'MOBOS:PRUEBA:corta:1234')
})

test('leerPrueba recupera exactamente lo que puso qrPrueba', () => {
  const datos = { destino: 'ZKP 8008 & cía.', validacion: '4821', fecha: '2026-09-20T12:00:00.000Z', tipo: 'caracteres' }
  const recuperado = leerPrueba(new URL(qrPrueba(datos, BASE)).search)
  assert.deepEqual(recuperado, datos)
  assert.deepEqual(leerPrueba('?d=ZKP&v=12&f=2026-09-20&t=corta'), { destino: 'ZKP', validacion: '12', fecha: '2026-09-20', tipo: 'corta' })
  assert.deepEqual(leerPrueba(''), { destino: '', validacion: '', fecha: '', tipo: '' })
})

test('leerPrueba recorta valores inesperados que llegan por URL', () => {
  const largo = 'x'.repeat(200)
  const datos = leerPrueba(`d=${largo}&v=${largo}&f=${largo}&t=${largo}`)
  assert.equal(datos.destino.length, 80)
  assert.equal(datos.validacion.length, 24)
  assert.equal(datos.fecha.length, 40)
  assert.equal(datos.tipo.length, 32)
})

test('leerEtiqueta entiende el QR nuevo y el código viejo', () => {
  assert.deepEqual(leerEtiqueta(`${BASE}/u/356789012345678`), { tipo: 'UNIDAD', valor: '356789012345678' })
  assert.deepEqual(leerEtiqueta(`${BASE}/producto/IPH-15-128`), { tipo: 'PROD', valor: 'IPH-15-128' })
  assert.deepEqual(leerEtiqueta(`${BASE}/p/token-vivo`), { tipo: 'PEDIDO', valor: 'token-vivo' })
  assert.deepEqual(leerEtiqueta(`${BASE}/prueba?d=ZKP&v=4821&f=2026-09-20T12%3A00%3A00.000Z&t=qr`), { tipo: 'PRUEBA', valor: '4821' })
  assert.deepEqual(leerEtiqueta('MOBOS:356789012345678'), { tipo: 'UNIDAD', valor: '356789012345678' })
  assert.deepEqual(leerEtiqueta('MOBOS:PROD:IPH-15-128'), { tipo: 'PROD', valor: 'IPH-15-128' })
  assert.deepEqual(leerEtiqueta('MOBOS:UBI:loc-1'), { tipo: 'UBI', valor: 'loc-1' })
})

test('leerEtiqueta no rompe con texto escrito a mano', () => {
  assert.deepEqual(leerEtiqueta('iphone 15'), { tipo: '', valor: 'iphone 15' })
  assert.deepEqual(leerEtiqueta('https://otro-sitio.com/u/ABC'), { tipo: 'UNIDAD', valor: 'ABC' })
  assert.deepEqual(leerEtiqueta(''), { tipo: '', valor: '' })
})
