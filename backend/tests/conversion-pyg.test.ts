import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Prisma } from '@prisma/client'

// El cliente (src/utils/conversionPyg.js) debe dar los mismos guaraníes que el
// servidor (payment-input.ts): Decimal mul + toDecimalPlaces(0, ROUND_HALF_UP).
const servidor = (monto: string, tasa: string) =>
  new Prisma.Decimal(monto).mul(new Prisma.Decimal(tasa)).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber()

test('conversión a PYG del cliente == servidor en 1.800+ combinaciones', async () => {
  const importar = new Function('u', 'return import(u)') as (u: string) => Promise<{ convertirAPyg: (m: string, t: string) => number }>
  const { convertirAPyg } = await importar(pathToFileURL(path.resolve(__dirname, '../../src/utils/conversionPyg.js')).href)
  const tasas = ['7250', '7300', '7300.5', '7301.46', '7284.25', '5935.01', '1375.5', '7249.99', '19999.99']
  let n = 0
  for (let cents = 1; cents <= 20000; cents += 11) {
    const monto = (cents / 100).toFixed(2)
    for (const tasa of tasas) { assert.equal(convertirAPyg(monto, tasa), servidor(monto, tasa), `${monto} x ${tasa}`); n++ }
  }
  assert.ok(n >= 721)
  assert.equal(convertirAPyg('2.01', '7250'), 14573)
})
