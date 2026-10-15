import test from 'node:test'
import assert from 'node:assert/strict'

// La demo guarda en el almacenamiento de la pestaña: acá, en memoria.
const memoria = new Map()
globalThis.localStorage = {
  getItem: (clave) => (memoria.has(clave) ? memoria.get(clave) : null),
  setItem: (clave, valor) => memoria.set(clave, String(valor)),
  removeItem: (clave) => memoria.delete(clave),
}
const { confirmDemoArrival, createDemoArrival, parseDemoArrival, patchDemoArrivalLine } = await import('./llegada.js')

const productos = [
  { id: 'p15', nombre: 'iPhone 15 Pro 256GB Titanio' },
  { id: 'p13', nombre: 'iPhone 13 128GB Blanco' },
  { id: 'p13b', nombre: 'iPhone 13 128GB Negro' },
  { id: 'ap', nombre: 'AirPods Pro 2 USB-C' },
]

const PEGADO = [
  '12/10/2026',
  '15 PRO 256GB TITANIO\t356938035643809\tIMPTEC\t980\tTUPI',
  '13 128GB BLANCO\t490154203237526\tDISESTE\t450\t',
  'AIRPODS PRO 2\tH2WK4PLM9Q\tMAYAPY\t180',
  '13 128GB\t3,52793E+14\tDISESTE\t450',
  '15 PRO 256GB TITANIO\t490154203237518\tIMPTEC\t980\tSE MANDA A CDE',
  '07/10/2026 · VOS PEDÍS',
  '13 128GB BLANCO\tCARGAR IMEI\tDISESTE\t450\tCARGAR IMEI',
].join('\n')

function nueva(clave) {
  return createDemoArrival({ arrivedAt: '2026-10-12', currency: 'USD', exchangeRatePyg: 7500, idempotencyKey: clave })
}

test('el intérprete demo lee bloques, errores de IMEI y destinos', () => {
  const llegada = nueva('demo-test-llegada-1')
  const { lines, summary } = parseDemoArrival(llegada.id, PEGADO, productos)
  assert.equal(lines.length, 6)
  assert.equal(lines[0].raw.blockDate, '2026-10-12')
  assert.equal(lines[5].raw.blockDate, '2026-10-07')
  assert.equal(lines[3].issues.some((issue) => issue.code === 'IMEI_EXCEL' && issue.severity === 'error'), true)
  assert.equal(lines[3].issues.some((issue) => issue.code === 'ELEGIR_PRODUCTO'), true, 'blanco y negro son candidatos')
  assert.equal(lines[4].destination, 'OTRA_SUCURSAL')
  assert.equal(lines[5].destination, 'FALTA_IMEI')
  assert.equal(summary.errores, 2)
  assert.throws(() => confirmDemoArrival(llegada.id, productos), /errores/)
})

test('corregir la fila con error habilita la confirmación y actualiza el resumen', () => {
  const llegada = nueva('demo-test-llegada-2')
  const parseada = parseDemoArrival(llegada.id, PEGADO, productos)
  const mala = parseada.lines[3]
  patchDemoArrivalLine(llegada.id, { lineId: mala.id, productId: 'p13b' }, productos)
  const final = patchDemoArrivalLine(llegada.id, { lineId: mala.id, serial: '490154203237534' }, productos)
  assert.equal(final.summary.errores, 0)
  assert.equal(final.summary.faltaImei, 1)
  assert.equal(final.summary.aOtraSucursal, 1)
  const confirmada = confirmDemoArrival(llegada.id, productos)
  assert.equal(confirmada.status, 'CONFIRMADA')
  assert.equal(confirmDemoArrival(llegada.id, productos).repetida, true)
})

test('«el IMEI es correcto» solo vale con Luhn y 000 finales', () => {
  const llegada = nueva('demo-test-llegada-3')
  const parseada = parseDemoArrival(llegada.id, PEGADO, productos)
  const mala = parseada.lines[3]
  patchDemoArrivalLine(llegada.id, { lineId: mala.id, productId: 'p13b' }, productos)
  const sin = patchDemoArrivalLine(llegada.id, { lineId: mala.id, serial: '352793100006000' }, productos)
  assert.equal(sin.lines[3].issues.some((issue) => issue.code === 'IMEI_EXCEL'), true)
  const con = patchDemoArrivalLine(llegada.id, { lineId: mala.id, serial: '352793100006000', confirmSerial: true }, productos)
  assert.equal(con.lines[3].issues.some((issue) => issue.severity === 'error'), false)
  const sinLuhn = patchDemoArrivalLine(llegada.id, { lineId: mala.id, serial: '352793000000000', confirmSerial: true }, productos)
  assert.equal(sinLuhn.lines[3].issues.some((issue) => issue.code === 'IMEI_EXCEL'), true)
})
