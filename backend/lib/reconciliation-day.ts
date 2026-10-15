import { createHash } from 'node:crypto'
import { Prisma, PaymentCurrency } from '@prisma/client'
import { InputError } from './payment-input'
import { COUNTABLE_PAYMENT_WHERE } from './payment-net'
import { LIMITE_MONTO_GENERAL } from './montos'
import { accountLabelOf, dailyGroupKey, evaluateDailyReconciliation, RECONCILIATION_METHODS, type DailyDeclaration } from './reconciliation'

export function reconciliationDayRange(day: unknown) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new InputError('Indicá el día (YYYY-MM-DD).')
  const start = new Date(`${day}T00:00:00-03:00`)
  if (Number.isNaN(start.getTime()) || new Date(start.getTime() - 3 * 3600000).toISOString().slice(0, 10) !== day) throw new InputError('El día es inválido.')
  return { day, start, end: new Date(start.getTime() + 86400000) }
}
export function parseDailyDeclarations(input: unknown): DailyDeclaration[] {
  if (!Array.isArray(input) || input.length > 200) throw new InputError('Indicá hasta 200 declaraciones por medio y cuenta.')
  const seen = new Set<string>()
  return input.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('Declaración inválida.')
    const { method, accountId, currency, receivedPyg } = raw
    if (!(RECONCILIATION_METHODS as readonly unknown[]).includes(method) || typeof currency !== 'string' || !(Object.values(PaymentCurrency) as string[]).includes(currency) || (accountId !== null && (typeof accountId !== 'string' || !accountId || accountId.length > 200))) throw new InputError('Medio, cuenta o moneda inválidos.')
    if (typeof receivedPyg !== 'number' || !Number.isSafeInteger(receivedPyg) || receivedPyg < 0 || receivedPyg > LIMITE_MONTO_GENERAL) throw new InputError('Recibido debe ser un importe entero en Gs válido, incluido cero.')
    const row = { method, accountId, currency, receivedPyg } as DailyDeclaration
    const key = dailyGroupKey(row)
    if (seen.has(key)) throw new InputError('No repitas un medio/cuenta/moneda.')
    seen.add(key)
    return row
  }).sort((a, b) => dailyGroupKey(a).localeCompare(dailyGroupKey(b)))
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const dailyRequestHash = (declarations: DailyDeclaration[], note: string | null) => digest({ declarations, note })

export async function dailyPayments(db: Pick<Prisma.TransactionClient, 'payment'>, tenantId: string, branchId: string, day: string, lock?: Prisma.TransactionClient) {
  const { start, end } = reconciliationDayRange(day)
  if (lock) await lock.$queryRaw`SELECT p."id" FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" AND o."tenantId" = p."tenantId" WHERE p."tenantId" = ${tenantId} AND o."branchId" = ${branchId} AND COALESCE(p."paidAt", p."createdAt") >= ${start} AND COALESCE(p."paidAt", p."createdAt") < ${end} ORDER BY p."id" FOR UPDATE OF p`
  const payments = await db.payment.findMany({ where: {
    tenantId, order: { tenantId, branchId }, status: 'CONFIRMED', method: { in: [...RECONCILIATION_METHODS] }, ...COUNTABLE_PAYMENT_WHERE,
    paidAt: { gte: start, lt: end },
  }, select: { id: true, method: true, status: true, amountPyg: true, accountId: true, currency: true, accountSnapshot: true, account: { select: { id: true, name: true, kind: true, bank: true, holder: true, processor: true } } }, orderBy: { id: 'asc' }, take: 5001 })
  if (payments.length > 5000) throw new InputError('Este día supera los 5000 cobros: no se puede verificar una muestra incompleta.', 409)
  return payments.map(payment => ({ ...payment, label: accountLabelOf(payment as any) }))
}
export function paymentEvidence(payments: Awaited<ReturnType<typeof dailyPayments>>) {
  return payments.map(row => ({ id: row.id, method: row.method, accountId: row.accountId, currency: row.currency || 'PYG', amountPyg: String(row.amountPyg) }))
}
export async function dailyView(db: Prisma.TransactionClient, tenantId: string, branchId: string, day: string) {
  const [payments, entry] = await Promise.all([
    dailyPayments(db, tenantId, branchId, day),
    db.reconciliationDay.findUnique({ where: { tenantId_branchId_businessDay: { tenantId, branchId, businessDay: day } }, include: { revisions: { orderBy: { version: 'desc' }, take: 20 } } }),
  ])
  const latest = entry?.revisions[0]
  const actorIds = [...new Set((entry?.revisions || []).map(row => row.createdById))]
  const actors = await db.user.findMany({ where: { tenantId, id: { in: actorIds } }, select: { id: true, name: true } })
  const names = new Map(actors.map(row => [row.id, row.name]))
  const declarations = latest ? parseDailyDeclarations(latest.declarations) : null
  return {
    day, branchId, ...evaluateDailyReconciliation(payments, declarations),
    version: latest?.version || 0, note: latest?.note || '', declarations,
    changedSinceDeclaration: Boolean(latest && digest(latest.paymentSnapshot) !== digest(paymentEvidence(payments))),
    declaredAt: latest?.createdAt || null, declaredById: latest?.createdById || null, declaredBy: latest ? names.get(latest.createdById) || 'Usuario' : '',
    history: (entry?.revisions || []).map(row => ({ id: row.id, version: row.version, createdAt: row.createdAt, createdById: row.createdById, createdBy: names.get(row.createdById) || 'Usuario', note: row.note, snapshot: row.snapshot })),
  }
}
