import assert from 'node:assert/strict'
import test from 'node:test'
import { valorNormalizado, borradorDecimal, formatGs, formatGsInput, formatUsd, formatUsdInput, parseGsInput, parseUsdInput, excedeMonto, errorMonto, limiteMonto, LIMITE_MONTO_ALMACENABLE, LIMITE_MONTO_GENERAL, LIMITE_MONTO_VENTAS, montoGs, montoUsd, montoTexto, largoMaximoMonto } from './moneda.js'
import { gs, gsInput } from './calculos.js'

test('formatea guaraníes con separadores locales', () => {
  assert.equal(formatGs(1201032), 'Gs 1.201.032')
  assert.equal(gs(1201032), 'Gs 1.201.032')
  assert.equal(formatGs(-1201032.7), '-Gs 1.201.033')
  assert.equal(formatGs(-50000), '-Gs 50.000', 'el signo va pegado al símbolo, sin hueco antes de la cifra')
  assert.equal(formatGs(-0.4), 'Gs 0', 'un redondeo a cero no lleva signo')
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

test('el tope real de almacenamiento ya no recorta los topes de producto', () => {
  assert.equal(LIMITE_MONTO_ALMACENABLE, LIMITE_MONTO_VENTAS, 'las columnas bigint guardan hasta el tope de ventas')
  assert.equal(limiteMonto(), LIMITE_MONTO_GENERAL, 'sin límite propio manda el general')
  assert.equal(limiteMonto(LIMITE_MONTO_GENERAL), LIMITE_MONTO_GENERAL, '10B entra completo')
  assert.equal(limiteMonto(LIMITE_MONTO_VENTAS), LIMITE_MONTO_VENTAS, '99B entra completo')
  assert.equal(limiteMonto(1_000_000), 1_000_000, 'un límite menor se respeta')
  assert.equal(limiteMonto('invalido'), LIMITE_MONTO_ALMACENABLE)
  assert.equal(errorMonto(2_000_000_000), '', 'dos mil millones entran')
  assert.equal(errorMonto(3_000_000_000), '', 'un monto antes bloqueado ahora entra')
  assert.equal(errorMonto(10_000_000_001), 'El monto supera el máximo que el sistema puede guardar (Gs 10.000.000.000).')
  assert.equal(errorMonto(100_000_000, LIMITE_MONTO_VENTAS), '', 'las ventas admiten hasta 99B')
  assert.equal(errorMonto(99_000_000_001, LIMITE_MONTO_VENTAS), 'El monto supera el máximo que el sistema puede guardar (Gs 99.000.000.000).')
})

test('borrador decimal: se pueden escribir 100, 300 y centavos dígito a dígito (USD)', () => {
  // Antes cada tecla se reformateaba como «1,00» y solo entraba 1 dígito.
  let texto = ''
  const escribir = (tecla) => { texto = borradorDecimal(texto + tecla).texto; return texto }
  assert.equal(escribir('3'), '3')
  assert.equal(escribir('0'), '30')
  assert.equal(escribir('0'), '300')
  assert.equal(borradorDecimal('300').valor, '300')
  assert.equal(borradorDecimal('300,').texto, '300,')
  assert.equal(borradorDecimal('300,5').valor, '300.5')
  assert.equal(borradorDecimal('300,567').texto, '300,56', 'máximo 2 decimales')
  assert.equal(borradorDecimal('1250').texto, '1.250')
  assert.equal(borradorDecimal('1.250,50').valor, '1250.5')
  assert.equal(borradorDecimal(',5').texto, '0,5')
  assert.equal(borradorDecimal('').valor, '')
  assert.equal(borradorDecimal('abc').texto, '')
})

test('formatUsdInput acepta decimal con coma (precarga del POS) y con punto', () => {
  assert.equal(formatUsdInput('12,50'), '12,50')
  assert.equal(formatUsdInput('1.234,5'), '1.234,50')
  assert.equal(formatUsdInput('300'), '300,00')
  assert.equal(formatUsdInput('300.5'), '300,50')
})

test('guaraníes: miles al escribir y valor numérico entero', () => {
  assert.equal(formatGsInput('7350'), '7.350')
  assert.equal(formatGsInput('1234567'), '1.234.567')
  assert.equal(parseGsInput('7.350'), 7350)
})

test('MoneyInput: el borrador sobrevive a cada tecla, también con «0» inicial (0,50 / 0,99)', () => {
  // Simula el campo: cada tecla recalcula borrador y valor; el borrador solo se
  // muestra si coincide con el valor guardado (borradorVigente).
  const tipear = (secuencia) => {
    let texto = ''
    let valor = ''
    for (const tecla of secuencia) {
      const b = borradorDecimal(texto + tecla)
      texto = b.texto
      valor = b.valor
      assert.equal(borradorDecimal(texto).valor === valorNormalizado(valor), true, `borrador vigente tras «${texto}»`)
    }
    return texto
  }
  assert.equal(tipear('0,50'), '0,50')
  assert.equal(tipear('0,99'), '0,99')
  assert.equal(tipear('10,5'), '10,5')
  assert.equal(tipear('300'), '300')
  assert.equal(tipear('1250,75'), '1.250,75')
  assert.equal(valorNormalizado('0'), '0')
  assert.equal(valorNormalizado(''), '')
})
