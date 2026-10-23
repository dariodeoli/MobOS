import test from 'node:test'
import assert from 'node:assert/strict'
import {
  POLITICA_POR_DEFECTO, archivosPorFila, comprobantesFaltantes, emparejarComprobantes, filaPideComprobante, mensajeSinConexion,
  normalizarPolitica, puedeEncolarVenta, requiereVerificacion, sinComprobantes, subirComprobantes, textoComprobantesFallidos,
  textoFaltaComprobante, tamanoLegible,
} from './comprobantePos.js'

const cuentas = [
  { id: 'c-efectivo', name: 'Caja Gs', kind: 'CASH', isActive: true },
  { id: 'c-transf', name: 'Transferencia Continental', kind: 'TRANSFER', isActive: true },
  { id: 'c-pix', name: 'PIX Itaú', kind: 'PIX', isActive: true },
  { id: 'c-tarjeta', name: 'POS Bancard', kind: 'CARD', isActive: true },
]
const archivo = (nombre) => ({ name: nombre, size: 1200, type: 'image/jpeg' })

test('la política saneada: valores inválidos quedan en automático y requireProof por defecto exige', () => {
  assert.equal(normalizarPolitica(null), null)
  const politica = normalizarPolitica({ methods: { PIX: 'verificar', TRANSFER: 'raro' }, accounts: { 'c-tarjeta': 'verificar', x: 'nada' } })
  assert.equal(politica.methods.PIX, 'verificar')
  assert.equal(politica.methods.TRANSFER, 'auto')
  assert.deepEqual(politica.accounts, { 'c-tarjeta': 'verificar' })
  assert.equal(politica.requireProof, true)
  assert.equal(normalizarPolitica({ requireProof: false }).requireProof, false)
})

test('solo los medios verificables piden comprobante y la cuenta manda sobre el medio', () => {
  assert.equal(requiereVerificacion(POLITICA_POR_DEFECTO, { method: 'PIX' }), true)
  assert.equal(requiereVerificacion(POLITICA_POR_DEFECTO, { method: 'CASH' }), false)
  assert.equal(requiereVerificacion(POLITICA_POR_DEFECTO, { method: 'CARD' }), false)
  const porCuenta = normalizarPolitica({ methods: { TRANSFER: 'verificar' }, accounts: { 'c-transf': 'auto', 'c-tarjeta': 'verificar' } })
  assert.equal(requiereVerificacion(porCuenta, { method: 'TRANSFER', accountId: 'c-transf' }), false)
  assert.equal(requiereVerificacion(porCuenta, { method: 'CARD', accountId: 'c-tarjeta' }), true)
  assert.equal(requiereVerificacion(null, { method: 'PIX' }), false, 'sin política (empresa existente o sin red) no se pide nada')
  assert.equal(requiereVerificacion(POLITICA_POR_DEFECTO, { method: 'CREDIT' }), false)
})

test('filas: efectivo y gift card no piden; transferencia y PIX sí; sin cuenta elegida no hay nada que pedir', () => {
  assert.equal(filaPideComprobante(POLITICA_POR_DEFECTO, { accountId: 'c-efectivo' }, cuentas), false)
  assert.equal(filaPideComprobante(POLITICA_POR_DEFECTO, { accountId: 'c-transf' }, cuentas), true)
  assert.equal(filaPideComprobante(POLITICA_POR_DEFECTO, { accountId: 'c-pix' }, cuentas), true)
  assert.equal(filaPideComprobante(POLITICA_POR_DEFECTO, { accountId: '' }, cuentas), false)
  assert.equal(filaPideComprobante(POLITICA_POR_DEFECTO, { giftCardCode: 'GC-1' }, cuentas), false)
})

test('sin comprobante no se confirma: lista lo que falta y lo escribe en una frase', () => {
  const pagos = [{ accountId: 'c-efectivo' }, { accountId: 'c-transf' }, { accountId: 'c-pix', comprobante: { file: archivo('a.jpg') } }, { accountId: 'c-transf' }]
  const faltan = comprobantesFaltantes(POLITICA_POR_DEFECTO, pagos, cuentas)
  assert.deepEqual(faltan.map(item => item.indice), [1, 3])
  assert.equal(textoFaltaComprobante(faltan), 'Adjuntá el comprobante de Transferencia Continental.')
  assert.equal(textoFaltaComprobante([{ nombre: 'A' }, { nombre: 'B' }, { nombre: 'C' }]), 'Adjuntá el comprobante de A, B y C.')
  assert.equal(textoFaltaComprobante([]), '')
  // Con requireProof apagado el comprobante es opcional: nunca bloquea.
  assert.deepEqual(comprobantesFaltantes({ ...POLITICA_POR_DEFECTO, requireProof: false }, pagos, cuentas), [])
})

test('sinComprobantes quita el File de cada pago sin tocar nada más', () => {
  const pagos = [{ accountId: 'c-pix', monto: '50000', comprobante: { file: archivo('a.jpg') } }, { accountId: 'c-efectivo', monto: '1000' }]
  assert.deepEqual(sinComprobantes(pagos), [{ accountId: 'c-pix', monto: '50000' }, { accountId: 'c-efectivo', monto: '1000' }])
  assert.deepEqual(sinComprobantes(undefined), [])
  assert.ok('comprobante' in pagos[0], 'no muta el original')
})

test('archivosPorFila: un archivo cambiado a un medio automático ya no viaja', () => {
  const pagos = [
    { accountId: 'c-pix', comprobante: { file: archivo('pix.jpg') } },
    { accountId: 'c-efectivo', comprobante: { file: archivo('viejo.jpg') } },
    { accountId: 'c-transf' },
  ]
  const archivos = archivosPorFila(POLITICA_POR_DEFECTO, pagos, cuentas)
  assert.equal(archivos[0].name, 'pix.jpg')
  assert.equal(archivos[1], null)
  assert.equal(archivos[2], null)
})

test('sin conexión no se encola una venta con comprobantes (el archivo se perdería)', () => {
  assert.equal(puedeEncolarVenta([null, null]), true)
  assert.equal(puedeEncolarVenta([null, archivo('a.jpg')]), false)
  assert.match(mensajeSinConexion([archivo('a.jpg')]), /Sin conexión: el comprobante se sube junto con la venta/)
  assert.equal(mensajeSinConexion([null]), '')
})

test('emparejar: cada archivo va al pago de su cuenta y monto, aunque el servidor devuelva otro orden', () => {
  const enviados = [
    { accountId: 'c-transf', amountPyg: 500000 },
    { accountId: 'c-efectivo', amountPyg: 100000 },
    { accountId: 'c-transf', amountPyg: 250000 },
  ]
  const a1 = archivo('uno.jpg')
  const a3 = archivo('tres.jpg')
  const creados = [
    { id: 'p-efectivo', accountId: 'c-efectivo', amountPyg: 100000, pendingReason: null },
    { id: 'p-250', accountId: 'c-transf', amountPyg: 250000, pendingReason: 'VERIFICACION' },
    { id: 'p-500', accountId: 'c-transf', amountPyg: 500000, pendingReason: 'VERIFICACION' },
  ]
  const pares = emparejarComprobantes(enviados, [a1, null, a3], creados)
  assert.deepEqual(pares.map(par => [par.indice, par.paymentId, par.file.name]), [[0, 'p-500', 'uno.jpg'], [2, 'p-250', 'tres.jpg']])
})

test('emparejar: dos pagos idénticos no comparten el mismo cobro; sin cobro disponible queda sin id', () => {
  const enviados = [{ accountId: 'c-pix', amountPyg: 1000 }, { accountId: 'c-pix', amountPyg: 1000 }, { accountId: 'c-pix', amountPyg: 1000 }]
  const creados = [
    { id: 'a', accountId: 'c-pix', amountPyg: 1000, pendingReason: 'VERIFICACION' },
    { id: 'b', accountId: 'c-pix', amountPyg: 1000, pendingReason: 'VERIFICACION' },
  ]
  const pares = emparejarComprobantes(enviados, [archivo('1'), archivo('2'), archivo('3')], creados)
  assert.deepEqual(pares.map(par => par.paymentId), ['a', 'b', null])
})

test('emparejar: si el monto difiere por redondeo, empareja por cuenta', () => {
  const pares = emparejarComprobantes([{ accountId: 'c-pix', amountPyg: 1000 }], [archivo('x')], [{ id: 'z', accountId: 'c-pix', amountPyg: 1001, pendingReason: 'VERIFICACION' }])
  assert.equal(pares[0].paymentId, 'z')
})

test('subida: reintenta, es idempotente al repetirla y reporta lo que no pudo subir', async () => {
  const llamadas = []
  let falla = 2
  const subir = async (paymentId, file) => {
    llamadas.push([paymentId, file.name])
    if (paymentId === 'p-flojo' && falla > 0) { falla -= 1; throw new Error('corte') }
    if (paymentId === 'p-roto') throw new Error('Tipo de archivo no permitido')
  }
  const pares = [
    { indice: 0, paymentId: 'p-flojo', file: archivo('a.jpg') },
    { indice: 1, paymentId: 'p-roto', file: archivo('b.jpg') },
    { indice: 2, paymentId: null, file: archivo('c.jpg') },
  ]
  const resultado = await subirComprobantes({ pares, subir, reintentos: 2 })
  assert.deepEqual(resultado.subidos.map(item => item.paymentId), ['p-flojo'])
  assert.deepEqual(resultado.fallidos.map(item => item.indice), [1, 2])
  assert.equal(resultado.fallidos[0].error, 'Tipo de archivo no permitido')
  assert.equal(llamadas.filter(([id]) => id === 'p-flojo').length, 3, 'dos cortes y un éxito')
  assert.equal(llamadas.filter(([id]) => id === 'p-roto').length, 3)
  assert.equal(llamadas.some(([id]) => id === null), false, 'sin cobro no se llama al servidor')
  // Repetir la subida entera (reintento del usuario) vuelve a llamar con los mismos pares: el servidor ignora el duplicado.
  const otra = await subirComprobantes({ pares: [pares[0]], subir })
  assert.equal(otra.fallidos.length, 0)
})

test('avisos de lo que no se subió y tamaños legibles', () => {
  assert.equal(textoComprobantesFallidos([]), '')
  assert.match(textoComprobantesFallidos([{}]), /^El comprobante no se subió\. La venta quedó guardada/)
  assert.match(textoComprobantesFallidos([{}, {}]), /^2 comprobantes no se subieron/)
  assert.equal(tamanoLegible(2048), '2 KB')
  assert.equal(tamanoLegible(1.5 * 1024 * 1024), '1,5 MB')
  assert.equal(tamanoLegible(0), '')
})
