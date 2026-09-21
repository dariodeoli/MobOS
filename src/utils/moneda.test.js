import assert from 'node:assert/strict'
import test from 'node:test'
import { formatGs, formatGsInput, formatUsd, formatUsdInput, parseGsInput, parseUsdInput } from './moneda.js'
import { gs, gsInput } from './calculos.js'

test('formatea guaraníes con separadores locales', () => {
  assert.equal(formatGs(1201032), 'Gs 1.201.032')
  assert.equal(gs(1201032), 'Gs 1.201.032')
  assert.equal(formatGs(-1201032.7), 'Gs -1.201.033')
})

test('formatea entrada de miles sin cambiar el valor numérico', () => {
  assert.equal(formatGsInput('1201032'), '1.201.032')
  assert.equal(formatGsInput('Gs 1.201.032'), '1.201.032')
  assert.equal(parseGsInput('1.201.032'), 1201032)
  assert.equal(gsInput('1201032'), '1.201.032')
})

test('formatea USD con decimales sin aplicar tipo de cambio', () => {
  assert.equal(formatUsd(1234.5), 'USD 1.234,50')
  assert.equal(formatUsd(0), 'USD 0,00')
})

test('la entrada de moneda respeta el contrato de cada divisa', () => {
  // PYG sin decimales (los puntos son separadores de miles); USD con 2.
  assert.equal(formatGsInput(1201032), '1.201.032')
  assert.equal(parseGsInput('Gs 1.201.032'), 1201032)
  assert.equal(formatUsdInput('1234.5'), '1.234,50')
  assert.equal(formatUsdInput(0), '0,00')
  assert.equal(parseUsdInput('1.234,50'), '1234.5')
  // El campo limpia el símbolo antes de parsear (MoneyInput hace ese paso).
  assert.equal(parseUsdInput('US$ 1.234,50'.replace(/[^\d.,]/g, '')), '1234.5')
  // Vacío y basura no inventan importes.
  assert.equal(formatUsdInput(''), '')
  assert.equal(parseUsdInput(''), '')
  assert.equal(parseUsdInput('no es un monto'), '')
})
