import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarCodigo, gs1Valido, mensajeNoEsImei, resolverLectura, MSG_AJENO } from './clasificarCodigo.js'
import { imeiDemo } from './demo/iphones.js'

const PRUEBA = 'https://app.moboss.online/prueba?d=CUPS:ZKP8008&v=6671&f=2026-10-14'
const sinLuhn = (imei) => `${imei.slice(0, 14)}${(Number(imei[14]) + 1) % 10}`

test('IMEI de 15 dígitos con Luhn válido e inválido', () => {
  const bueno = imeiDemo(5)
  assert.deepEqual(clasificarCodigo(bueno), { tipo: 'imei', valor: bueno, luhnOk: true, origen: 'codigo' })
  assert.equal(clasificarCodigo(sinLuhn(bueno)).luhnOk, false)
})

test('EAN/UPC válidos son código de producto y no IMEI', () => {
  assert.equal(gs1Valido('4006381333931'), true)
  assert.equal(gs1Valido('036000291452'), true)
  assert.equal(gs1Valido('4006381333932'), false)
  assert.equal(clasificarCodigo('4006381333931').tipo, 'barras')
  assert.match(mensajeNoEsImei(clasificarCodigo('4006381333931')), /código de barras de un producto/)
})

test('el SKU o código del catálogo se reconoce como producto', () => {
  const productos = [{ id: 'p1', sku: 'IP15PRO-256-TIT', nombre: 'iPhone 15 Pro' }]
  const r = clasificarCodigo('ip15pro-256-tit', { productos })
  assert.equal(r.tipo, 'producto')
  assert.equal(r.producto.id, 'p1')
})

test('serial alfanumérico de equipo', () => {
  assert.equal(clasificarCodigo('H2WK4PLM9Q').tipo, 'serial')
})

test('el QR de la hoja de prueba no es IMEI ni producto', () => {
  const r = clasificarCodigo(PRUEBA)
  assert.equal(r.tipo, 'mobos')
  assert.equal(r.entidad, 'PRUEBA')
  assert.match(mensajeNoEsImei(r), /hoja de prueba de la impresora/)
})

test('cualquier otra URL o QR responde que no es un IMEI ni un producto', () => {
  const r = clasificarCodigo('https://example.com/promo?x=1')
  assert.equal(r.tipo, 'ajeno')
  assert.equal(mensajeNoEsImei(r), MSG_AJENO)
  assert.equal(clasificarCodigo('hola mundo').tipo, 'ajeno')
  assert.equal(clasificarCodigo('').tipo, 'vacio')
})

test('QR de MobOS de unidad se resuelve al serial', () => {
  const imei = imeiDemo(9)
  const r = clasificarCodigo(`https://app.moboss.online/u/${imei}`)
  assert.equal(r.tipo, 'imei')
  assert.equal(r.valor, imei)
  assert.equal(r.origen, 'qr')
  assert.equal(clasificarCodigo(`MOBOS:${imei}`).valor, imei)
})

test('resolverLectura: agregar, duplicado, Luhn a confirmar, rechazo y cambio de línea', () => {
  const imei = imeiDemo(11)
  assert.equal(resolverLectura(imei).accion, 'agregar')
  assert.equal(resolverLectura(imei, { cargados: [imei] }).accion, 'duplicado')
  assert.equal(resolverLectura(sinLuhn(imei)).accion, 'confirmar-luhn')
  const forzado = resolverLectura(sinLuhn(imei), { forzarLuhn: true })
  assert.equal(forzado.accion, 'agregar')
  assert.equal(forzado.luhnForzado, true)
  assert.equal(resolverLectura(PRUEBA).accion, 'rechazar')
  const lineas = [{ id: 'l1', productId: 'p1' }]
  const productos = [{ id: 'p1', sku: 'ABC-1', nombre: 'iPhone' }]
  assert.equal(resolverLectura('ABC-1', { productos, lineas }).lineId, 'l1')
  assert.equal(resolverLectura('4006381333931', { productos, lineas }).accion, 'rechazar')
})
