import assert from 'node:assert/strict'
import test from 'node:test'
import { textoDatosCuenta, filasDeCuenta } from './datosCuenta.js'

const cuenta = {
  kind: 'TRANSFER', name: 'Itaú', bank: 'Itaú', holder: 'Aurora Móviles', accountNumber: '001 2456789',
  document: '80012345-0', aliasType: 'EMAIL', aliasValue: 'pagos@aurora.com.py',
}

test('copiar datos: titular, banco, cuenta, CI/RUC y alias en un bloque limpio', () => {
  assert.equal(textoDatosCuenta(cuenta), [
    'Titular: Aurora Móviles',
    'Banco: Itaú',
    'Nro de cuenta: 0012456789',
    'CI/RUC: 80012345-0',
    'Alias (Correo): pagos@aurora.com.py',
  ].join('\n'))
})

test('sin alias no se inventa la línea y sin datos el texto queda vacío', () => {
  const { aliasValue, aliasType, ...sinAlias } = cuenta
  assert.ok(!textoDatosCuenta(sinAlias).includes('Alias'))
  assert.equal(textoDatosCuenta({ kind: 'CASH', name: 'Caja' }), '')
  assert.equal(filasDeCuenta({ kind: 'CASH' }).length, 0)
})

test('alias sin tipo se rotula solo «Alias»', () => {
  assert.match(textoDatosCuenta({ ...cuenta, aliasType: '' }), /^Alias: pagos@/m)
})
