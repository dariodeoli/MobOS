import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoDeStock, datosListaPrecios, enlaceWhatsApp, stockDeCelular, telefonoLegible } from './listaPrecios.js'

const celulares = [
  { id: 'a', modelo: 'iPhone 15', capacidad: '128GB', color: 'Azul', estado: 'Nuevo', precio: 4850000, activo: true },
  { id: 'b', modelo: 'iPhone 15 Pro', capacidad: '256GB', color: 'Titanio', estado: 'Nuevo', precio: 6850000, activo: true },
  { id: 'c', modelo: 'iPhone 15 Pro', capacidad: '128GB', color: 'Negro', estado: 'Nuevo', precio: 6300000, activo: true },
  { id: 'd', modelo: 'iPhone 13', capacidad: '128GB', color: 'Blanco', estado: 'Seminuevo', precio: 3050000, activo: true },
  { id: 'e', modelo: 'iPhone 11', capacidad: '64GB', color: 'Verde', estado: 'Seminuevo', precio: 0, activo: true },
  { id: 'f', modelo: 'iPhone 12', capacidad: '64GB', color: 'Rojo', estado: 'Seminuevo', precio: 2000000, activo: false },
]
const productos = [
  { name: 'iPhone 15 128GB Azul', condition: 'NEW', stock: 1 },
  { name: 'iPhone 15 Pro 256GB Titanio', condition: 'NEW', stock: 0 },
  { name: 'iPhone 15 Pro 128GB Negro', condition: 'NEW', stock: 5 },
  { name: 'iPhone 13 128GB Blanco', condition: 'USED', stock: 2 },
]

test('el stock no mezcla «iPhone 15» con «iPhone 15 Pro» ni condiciones', () => {
  assert.equal(stockDeCelular(celulares[0], productos), 1)
  assert.equal(stockDeCelular(celulares[1], productos), 0)
  assert.equal(stockDeCelular(celulares[2], productos), 5)
  assert.equal(stockDeCelular({ ...celulares[0], estado: 'Seminuevo' }, productos), null)
  assert.equal(stockDeCelular({ modelo: 'Galaxy S24', capacidad: '256GB', estado: 'Nuevo' }, productos), null)
})

test('avisos: sin stock, últimas unidades y nada cuando alcanza o no hay dato', () => {
  assert.equal(avisoDeStock(0), 'sin-stock')
  assert.equal(avisoDeStock(1), 'ultimas')
  assert.equal(avisoDeStock(2), 'ultimas')
  assert.equal(avisoDeStock(3), '')
  assert.equal(avisoDeStock(null), '')
})

test('la lista agrupa por condición y modelo, deja afuera lo inactivo o sin precio y marca el stock', () => {
  const datos = datosListaPrecios({ celulares, productos, fecha: new Date('2026-10-15T12:00:00Z'), tienda: { nombre: 'Aurora', telefono: '0983123456' } })
  assert.deepEqual(datos.bloques.map((b) => b.titulo), ['Nuevos', 'Semi nuevos'])
  const nuevos = datos.bloques[0]
  const pro = nuevos.modelos.find((m) => m.modelo === 'iPhone 15 Pro')
  assert.deepEqual(pro.filas.map((f) => f.capacidad), ['128GB', '256GB'], 'capacidad ascendente')
  assert.equal(pro.filas[1].aviso, 'sin-stock')
  assert.equal(pro.filas[0].aviso, '')
  assert.equal(nuevos.modelos.find((m) => m.modelo === 'iPhone 15').filas[0].aviso, 'ultimas')
  assert.equal(datos.bloques[1].modelos.length, 1, 'sin el sin precio ni el inactivo')
  assert.equal(datos.filas, 4)
  assert.match(datos.vigencia, /15\/10\/2026/)
  assert.equal(datos.tienda.whatsapp, 'https://wa.me/595983123456?text=')
  assert.equal(datos.tienda.telefono, '+595 983 123 456')
})

test('sin «mostrar stock» no hay avisos y con cotización suma el precio en dólares', () => {
  const datos = datosListaPrecios({ celulares, productos, mostrarStock: false, cotizacion: 7500 })
  assert.ok(datos.bloques.every((b) => b.modelos.every((m) => m.filas.every((f) => f.aviso === ''))))
  assert.equal(datos.bloques[0].modelos[0].filas[0].precioUsd > 0, true)
  const sinUsd = datosListaPrecios({ celulares })
  assert.equal(sinUsd.bloques[0].modelos[0].filas[0].precioUsd, 0)
})

test('teléfono y WhatsApp sacan el 0 de marcado local y no duplican el código de país', () => {
  assert.equal(enlaceWhatsApp('0983 123 456'), 'https://wa.me/595983123456?text=')
  assert.equal(enlaceWhatsApp('+595 983 123 456'), 'https://wa.me/595983123456?text=')
  assert.equal(enlaceWhatsApp('+595 0983 123 456'), 'https://wa.me/595983123456?text=')
  assert.equal(enlaceWhatsApp(''), '')
  assert.equal(telefonoLegible('+595 0983123456'), '+595 983 123 456')
  assert.equal(telefonoLegible(''), '')
})
