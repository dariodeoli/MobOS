import assert from 'node:assert/strict'
import test from 'node:test'
import { DIA_MS, calcularRecargoPyg, diasDeAtraso, esCuotaVencida, plantillaDeCobranza, renderPlantilla, variablesDeCuota } from '../lib/collections'

const AHORA = new Date('2026-09-20T12:00:00.000Z')

test('días de atraso: vencida, borde, futura y fecha inválida', () => {
  assert.equal(diasDeAtraso(new Date(AHORA.getTime() - 3 * DIA_MS), AHORA), 3)
  // 23 h después del vencimiento todavía son 0 días completos.
  assert.equal(diasDeAtraso(new Date(AHORA.getTime() - DIA_MS + 3600000), AHORA), 0)
  assert.equal(diasDeAtraso(new Date(AHORA.getTime() + DIA_MS), AHORA), 0)
  assert.equal(diasDeAtraso(null, AHORA), 0)
  assert.equal(diasDeAtraso('no-es-fecha', AHORA), 0)
})

test('es cuota vencida justo en la fecha límite (inclusive) y nunca con fecha inválida', () => {
  assert.equal(esCuotaVencida(new Date(AHORA.getTime()), AHORA), true)
  assert.equal(esCuotaVencida(new Date(AHORA.getTime() + 1), AHORA), false)
  assert.equal(esCuotaVencida('', AHORA), false)
  assert.equal(esCuotaVencida(undefined, AHORA), false)
})

test('recargo por mora: sin tasa o sin atraso es cero; con tasa aplica y topa en 20 %', () => {
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 10, bpPorDia: 0 }), 0)
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 10, bpPorDia: null }), 0)
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 0, bpPorDia: 50 }), 0)
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 10, bpPorDia: 10 }), 1000)
  // 1 % diario por 30 días = 30 % bruto, recortado por el tope del 20 %.
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 30, bpPorDia: 100 }), 20000)
  assert.equal(calcularRecargoPyg({ amountPyg: -5, diasAtraso: 30, bpPorDia: 100 }), 0)
})

test('la plantilla de cobranzas prioriza la predeterminada y cae al texto base', () => {
  const base = [
    { key: 'cuota_por_vencer', body: 'A {{cliente}}', isActive: true, isDefault: false },
    { key: 'cuota_vencida', body: 'B {{cliente}}', isActive: true, isDefault: false },
  ]
  assert.equal(plantillaDeCobranza(base, 'fallback', false).key, 'cuota_por_vencer')
  assert.equal(plantillaDeCobranza(base, 'fallback', true).key, 'cuota_vencida')
  assert.equal(plantillaDeCobranza([{ key: 'x', body: 'X', isActive: true, isDefault: true }], 'fallback', true).body, 'X')
  assert.equal(plantillaDeCobranza([], 'fallback', true).body, 'fallback')
  assert.equal(plantillaDeCobranza([{ key: 'x', body: 'X', isActive: false, isDefault: true }], 'fallback', false).body, 'fallback')
})

test('las variables de la cuota dejan el recargo vacío cuando no corresponde', () => {
  const sinRecargo = variablesDeCuota({ cliente: 'Ana', pedido: 'MOB-1', vencimiento: '15/09/2026', saldoPendiente: 40000, diasAtraso: 5, recargoPyg: 0, empresa: 'Tienda', sucursal: 'Centro' })
  assert.equal(renderPlantilla('Hola {{cliente}}, saldo {{saldo_pendiente}} ({{dias_atraso}} días)', sinRecargo), 'Hola Ana, saldo Gs. 40.000 (5 días)')
  assert.equal(sinRecargo.recargo, '')
  const conRecargo = variablesDeCuota({ cliente: 'Ana', pedido: 'MOB-1', vencimiento: '15/09/2026', saldoPendiente: 40000, diasAtraso: 5, recargoPyg: 1000, empresa: 'Tienda', sucursal: 'Centro' })
  assert.equal(conRecargo.recargo, 'Gs. 1.000')
  assert.equal(conRecargo.total, 'Gs. 41.000')
  assert.equal(renderPlantilla('Pedido {{pedido}} de {{empresa}}', conRecargo), 'Pedido MOB-1 de Tienda')
})
