import assert from 'node:assert/strict'
import { DEFAULT_CREDIT_CONFIG, effectiveCreditLimits, nextDayOfMonth, parseCreditConfig, resolveCreditTerm, splitInstallments } from '../lib/credit-config'
import { evaluateCreditSale } from '../lib/credit-rules'

// Valores por defecto seguros ante cualquier JSON.
for (const settings of [undefined, null, {}, { moduleConfig: null }, { moduleConfig: { cuotas: 'x' } }, 7]) {
  assert.deepEqual(parseCreditConfig(settings), DEFAULT_CREDIT_CONFIG)
}
const cfg = parseCreditConfig({ moduleConfig: { cuotas: {
  defaultLimitPyg: 5_000_000, tolerancePct: 10,
  plazo: { mode: 'CUOTAS', days: 15, dayOfMonth: 5, installments: 4, intervalDays: 30, maxDays: 90 },
  avisos: { internosDiasAntes: [0, 3, 3, -1, 'x'], cliente: 'whatsapp', emailAuto: true },
} } })
assert.equal(cfg.defaultLimitPyg, 5_000_000)
assert.equal(cfg.tolerancePct, 10)
assert.deepEqual(cfg.plazo, { mode: 'CUOTAS', days: 15, dayOfMonth: 5, installments: 4, intervalDays: 30, maxDays: 90 })
assert.deepEqual(cfg.avisos, { internosDiasAntes: [3, 0], cliente: 'whatsapp', emailAuto: true })
// Valores inválidos: tolerancia fuera de 0/10/20/30 = 0; modo desconocido = DIAS; límite negativo = 0.
const malo = parseCreditConfig({ moduleConfig: { cuotas: { defaultLimitPyg: -1, tolerancePct: 55, plazo: { mode: 'X', dayOfMonth: 40, installments: 1, maxDays: 9999 }, avisos: { cliente: 'sms' } } } })
assert.equal(malo.defaultLimitPyg, 0)
assert.equal(malo.tolerancePct, 0)
assert.equal(malo.plazo.mode, 'DIAS')
assert.equal(malo.plazo.dayOfMonth, 10)
assert.equal(malo.plazo.installments, 3)
assert.equal(malo.plazo.maxDays, 365)
assert.equal(malo.avisos.cliente, 'off')

// Cliente sin límite propio usa el del módulo y su tolerancia; con límite propio manda la ficha.
assert.deepEqual(effectiveCreditLimits({ creditLimitPyg: null }, cfg), { limitPyg: 5_000_000, tolerancePct: 10, source: 'module' })
assert.deepEqual(effectiveCreditLimits({ creditLimitPyg: 0 }, cfg), { limitPyg: 5_000_000, tolerancePct: 10, source: 'module' })
assert.deepEqual(effectiveCreditLimits({ creditLimitPyg: 2_000_000 }, cfg), { limitPyg: 2_000_000, tolerancePct: 10, source: 'customer' })
assert.deepEqual(effectiveCreditLimits({ creditLimitPyg: BigInt(2_000_000), creditTolerancePct: 0 }, cfg), { limitPyg: 2_000_000, tolerancePct: 0, source: 'customer' })
assert.deepEqual(effectiveCreditLimits(null, DEFAULT_CREDIT_CONFIG), { limitPyg: 0, tolerancePct: 0, source: 'module' })
const efectivo = effectiveCreditLimits({ creditLimitPyg: null }, cfg)
assert.equal(evaluateCreditSale({ limitPyg: efectivo.limitPyg, debtPyg: 0, unpaidPyg: 5_500_000, tolerancePct: efectivo.tolerancePct }).requiresAuthorization, false)
assert.equal(evaluateCreditSale({ limitPyg: efectivo.limitPyg, debtPyg: 0, unpaidPyg: 5_500_001, tolerancePct: efectivo.tolerancePct }).requiresAuthorization, true)

// Plazo en días: ficha > módulo; lo que pide el vendedor manda sobre ambos.
const ahora = new Date('2026-10-22T15:00:00.000Z')
const dias = parseCreditConfig({ moduleConfig: { cuotas: { plazo: { mode: 'DIAS', days: 15, maxDays: 60 } } } })
assert.equal(resolveCreditTerm({ config: dias, unpaidPyg: 1000, now: ahora }).creditDays, 15)
assert.equal(resolveCreditTerm({ config: dias, customer: { creditLimitPyg: 1, creditDays: 30 }, unpaidPyg: 1000, now: ahora }).creditDays, 30)
assert.equal(resolveCreditTerm({ config: dias, customer: { creditLimitPyg: 1, creditDays: 30 }, requestedDays: 7, unpaidPyg: 1000, now: ahora }).creditDays, 7)
const largo = resolveCreditTerm({ config: dias, requestedDays: 61, unpaidPyg: 1000, now: ahora })
assert.equal(largo.exceedsMaxDays, true, 'más allá de maxDays pide CREDIT_DAYS')
assert.equal(resolveCreditTerm({ config: dias, requestedDays: 60, unpaidPyg: 1000, now: ahora }).exceedsMaxDays, false)
assert.equal(resolveCreditTerm({ config: dias, requestedDueAt: new Date(ahora.getTime() + 90 * 86400000), unpaidPyg: 1000, now: ahora }).exceedsMaxDays, true)

// El plazo de la ficha o del módulo ya lo fijó administración: no se controla contra el máximo.
assert.equal(resolveCreditTerm({ config: dias, customer: { creditLimitPyg: 1, creditDays: 90 }, unpaidPyg: 1000, now: ahora }).exceedsMaxDays, false)

// Día del mes: el próximo, acotado al fin de mes.
assert.equal(nextDayOfMonth(new Date('2026-10-22T15:00:00.000Z'), 5).toISOString().slice(0, 10), '2026-11-05')
assert.equal(nextDayOfMonth(new Date('2026-10-22T15:00:00.000Z'), 28).toISOString().slice(0, 10), '2026-10-28')
assert.equal(nextDayOfMonth(new Date('2026-10-22T15:00:00.000Z'), 22).toISOString().slice(0, 10), '2026-11-22', 'el mismo día pasa al mes siguiente')
assert.equal(nextDayOfMonth(new Date('2027-01-31T15:00:00.000Z'), 31).toISOString().slice(0, 10), '2027-02-28')
assert.equal(nextDayOfMonth(new Date('2026-12-20T15:00:00.000Z'), 10).toISOString().slice(0, 10), '2027-01-10')
const mes = resolveCreditTerm({ config: parseCreditConfig({ moduleConfig: { cuotas: { plazo: { mode: 'DIA_MES', dayOfMonth: 5 } } } }), customer: { creditLimitPyg: 1, creditTermMode: 'DIA_MES', creditDayOfMonth: 28 }, unpaidPyg: 1, now: ahora })
assert.equal(mes.dueAt.toISOString().slice(0, 10), '2026-10-28')

// Cuotas: enteras, suman el saldo y el resto va a la última.
const plan = splitInstallments(1_000_001, 3, 30, ahora)
assert.deepEqual(plan.map(c => c.amountPyg), [333_333, 333_333, 333_335])
assert.equal(plan.reduce((suma, c) => suma + c.amountPyg, 0), 1_000_001)
assert.equal(plan[0].dueAt.getTime() - ahora.getTime(), 30 * 86400000)
const cuotas = resolveCreditTerm({ config: cfg, customer: { creditLimitPyg: 1, creditInstallments: 2 }, unpaidPyg: 1_000_001, now: ahora })
assert.equal(cuotas.mode, 'CUOTAS')
assert.equal(cuotas.installments.length, 2)
assert.equal(cuotas.dueAt.getTime(), cuotas.installments[1].dueAt.getTime())

console.log('credit-config.test.ts: ok')
