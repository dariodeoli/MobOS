import type { CashDirection, CashMovementKind, PaymentCurrency, Prisma, PrismaClient } from '@prisma/client'
import { FINANCE_CURRENCIES, FinanceInputError, frozenAmountPyg } from './finance'

export const CASH_MOVEMENT_KINDS = ['EXPENSE', 'TRANSFER', 'SUPPLIER_ADVANCE', 'CHEQUE', 'OWNER_WITHDRAWAL', 'ADJUSTMENT'] as const
export const CASH_DIRECTIONS = ['IN', 'OUT'] as const

export type CreateCashMovementInput = {
  tenantId: string
  branchId: string | null
  createdById: string
  kind: CashMovementKind
  direction: CashDirection
  currency: PaymentCurrency
  originalAmount: string
  exchangeRatePyg: string
  counterparty: string | null
  reference: string | null
  description: string
  dueAt: Date | null
  accountId: string | null
}

export type CreateCashMovementOptions = {
  auditAction: 'CASH_MOVEMENT_RECORDED' | 'FINANCE_MOVEMENT_CREATED'
  auditMetadata?: Record<string, unknown>
  includeAccount?: boolean
}

// Acepta el cliente global o el cliente transaccional: la validación, el
// movimiento y su auditoría quedan en la misma unidad de trabajo del llamador.
type MovementDb = PrismaClient | Prisma.TransactionClient

const cleanText = (value: string | null, field: string, max: number) => {
  if (value === null) return null
  if (typeof value !== 'string') throw new FinanceInputError(`${field} inválido.`)
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > max) throw new FinanceInputError(`${field} inválido.`)
  return trimmed
}

/**
 * Única puerta de entrada para registrar movimientos de caja. Valida con las
 * reglas más estrictas de /api/cash y /api/finance (tipos, dirección, moneda,
 * cotización congelada vía Decimal, textos acotados, vencimiento y cuenta),
 * calcula amountPyg con redondeo HALF_UP y escribe el CashMovement junto a su
 * auditoría en la misma transacción. Las rutas conservan sus contratos HTTP:
 * la validación de formulario y el chequeo de cuenta/moneda quedan en cada una.
 */
export async function createCashMovement(db: MovementDb, input: CreateCashMovementInput, options: CreateCashMovementOptions) {
  if (!(CASH_MOVEMENT_KINDS as readonly string[]).includes(input.kind)) throw new FinanceInputError('Tipo de movimiento inválido.')
  if (!(CASH_DIRECTIONS as readonly string[]).includes(input.direction)) throw new FinanceInputError('Dirección de movimiento inválida.')
  if (!(FINANCE_CURRENCIES as readonly string[]).includes(input.currency)) throw new FinanceInputError('Moneda inválida.')
  const description = cleanText(input.description, 'Descripción', 500)
  if (description === null) throw new FinanceInputError('Descripción es obligatoria.')
  const counterparty = cleanText(input.counterparty, 'Contraparte', 200)
  const reference = cleanText(input.reference, 'Referencia', 200)
  const accountId = cleanText(input.accountId, 'Cuenta', 200)
  if (input.dueAt !== null && (!(input.dueAt instanceof Date) || !Number.isFinite(input.dueAt.getTime()))) throw new FinanceInputError('Vencimiento inválido.')
  const amountPyg = frozenAmountPyg(input.originalAmount, input.currency, input.exchangeRatePyg)
  const isCheque = input.kind === 'CHEQUE'
  const data = {
    tenantId: input.tenantId,
    branchId: input.branchId,
    accountId,
    createdById: input.createdById,
    kind: input.kind,
    direction: input.direction,
    currency: input.currency,
    originalAmount: input.originalAmount,
    exchangeRatePyg: input.exchangeRatePyg,
    amountPyg,
    counterparty,
    reference,
    description,
    dueAt: input.dueAt,
    status: isCheque ? 'PENDING' as const : 'CLEARED' as const,
    clearedAt: isCheque ? null : new Date(),
  }
  const created = options.includeAccount
    ? await db.cashMovement.create({ data, include: { account: { select: { id: true, name: true, currency: true } } } })
    : await db.cashMovement.create({ data })
  await db.auditLog.create({ data: { tenantId: input.tenantId, userId: input.createdById, action: options.auditAction, entity: 'CashMovement', entityId: created.id, metadata: { kind: input.kind, direction: input.direction, currency: input.currency, originalAmount: input.originalAmount, exchangeRatePyg: input.exchangeRatePyg, amountPyg, ...(options.auditMetadata ?? {}) } } })
  return created
}
