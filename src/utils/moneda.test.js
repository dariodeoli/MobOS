import assert from 'node:assert/strict'
import test from 'node:test'
import { formatGs, formatGsInput, formatUsd, formatUsdInput, parseGsInput, parseUsdInput, excedeMonto, LIMITE_MONTO_VENTAS, montoGs, montoUsd, montoTexto, largoMaximoMonto } from './moneda.js'
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

test('los montos respetan el tamaño de la app sin truncar', () => {
  // #148 sección 9: general hasta 10.000.000.000; ventas hasta 99.000.000.000.
  assert.equal(formatGsInput(9999999999), '9.999.999.999')
  assert.equal(formatGsInput(99000000000), '99.000.000.000')
  assert.equal(excedeMonto(10000000000), false)
  assert.equal(excedeMonto(10000000001), true)
  assert.equal(excedeMonto(99000000000, LIMITE_MONTO_VENTAS), false)
  assert.equal(excedeMonto(99000000001, LIMITE_MONTO_VENTAS), true)
  assert.equal(excedeMonto(''), false)
  assert.equal(excedeMonto('98.000.000,50', LIMITE_MONTO_VENTAS), false)
  assert.equal(excedeMonto(-10000000001), true)
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

test('los montos de pantalla usan la presentación dominante y no inventan datos', () => {
  // Mismo texto que ui/Money: PYG sin decimales y USD con separador en-US
  // (hasta 2 decimales: 1234.5 se muestra "1,234.5", igual que hoy).
  assert.equal(montoGs(1201032), 'Gs 1.201.032')
  assert.equal(montoUsd(1234.56), 'US$ 1,234.56')
  assert.equal(montoUsd(1234.5), 'US$ 1,234.5')
  assert.equal(montoTexto('1234.5', 'USD'), 'US$ 1,234.5')
  assert.equal(montoTexto(1201032), 'Gs 1.201.032')
  // Un valor ausente o inválido no se muestra como 0.
  assert.equal(montoGs(undefined), '—')
  assert.equal(montoUsd('nada'), '—')
  assert.equal(montoTexto(null), '—')
  assert.equal(montoGs(null, ''), '')
})

test('el largo máximo del monto sale del tope permitido', () => {
  assert.equal(largoMaximoMonto(10_000_000_000), 14)
  assert.equal(largoMaximoMonto(99_000_000_000), 14)
  assert.equal(largoMaximoMonto(10_000_000_000, { decimales: true }), 17)
  assert.equal(largoMaximoMonto(1000), 5)
})
