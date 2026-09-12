import { Prisma, type PaymentAccountKind, type PaymentCurrency } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { accountSnapshot, decimalInput, InputError, objectInput, textInput } from '../../../lib/payment-input'

function accountData(input: Record<string, unknown>, create: boolean) {
  const data: { name?: string; bank?: string | null; holder?: string | null; accountNumber?: string | null; currency?: PaymentCurrency; kind?: PaymentAccountKind; isActive?: boolean; feePercent?: Prisma.Decimal } = {}
  if (create || input.name !== undefined) data.name = textInput(input.name, 'name', 200)
  for (const field of ['bank', 'holder', 'accountNumber'] as const) {
    if (input[field] !== undefined) data[field] = input[field] === null || input[field] === '' ? null : textInput(input[field], field, 200)
  }
  if (create || input.currency !== undefined) {
    if (!['PYG', 'USD', 'BRL', 'EUR', 'USDT'].includes(input.currency as string)) throw new InputError('Moneda inválida.')
    data.currency = input.currency as PaymentCurrency
  }
  if (create || input.kind !== undefined) {
    if (!['CASH', 'TRANSFER', 'CARD', 'TRADE_IN'].includes(input.kind as string)) throw new InputError('Tipo de cuenta inválido. CREDIT solo es un método legacy.')
    data.kind = input.kind as PaymentAccountKind
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') throw new InputError('isActive debe ser booleano.')
    data.isActive = input.isActive
  }
  if (input.feePercent !== undefined) {
    data.feePercent = decimalInput(input.feePercent, 'feePercent', 2, true)
    if (data.feePercent.gt(100)) throw new InputError('feePercent debe estar entre 0 y 100.')
  }
  return data
}

function validateTransfer(account: { kind?: PaymentAccountKind; bank?: string | null; holder?: string | null; accountNumber?: string | null }) {
  if (account.kind !== 'TRANSFER') return
  for (const field of ['bank', 'holder', 'accountNumber'] as const) textInput(account[field], field, 200)
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  return json(await prisma.paymentAccount.findMany({ where: { tenantId: session.user.tenantId, ...(session.user.role === 'ADMIN' ? {} : { isActive: true }) }, orderBy: { name: 'asc' } }))
}

async function write(request: Request, create: boolean) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const data = accountData(body, create)
    const tenantId = session.user.tenantId
    const result = await prisma.$transaction(async tx => {
      if (create) {
        validateTransfer(data)
        const account = await tx.paymentAccount.create({ data: { ...data, tenantId, name: data.name!, currency: data.currency!, kind: data.kind! } })
        await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PAYMENT_ACCOUNT_CREATED', entity: 'PaymentAccount', entityId: account.id, metadata: { after: accountSnapshot(account) } } })
        return account
      }
      const id = textInput(body.id, 'id', 200)
      await tx.$queryRaw`SELECT "id" FROM "PaymentAccount" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const before = await tx.paymentAccount.findFirst({ where: { id, tenantId } })
      if (!before) throw new InputError('Cuenta no encontrada.', 404)
      if (!Object.keys(data).length) throw new InputError('Faltan cambios.')
      validateTransfer({ ...before, ...data })
      const account = await tx.paymentAccount.update({ where: { id }, data })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PAYMENT_ACCOUNT_UPDATED', entity: 'PaymentAccount', entityId: id, metadata: { before: accountSnapshot(before), after: accountSnapshot(account) } } })
      return account
    })
    return json(result, { status: create ? 201 : 200 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo guardar la cuenta.', e instanceof InputError ? e.status : e instanceof SyntaxError ? 400 : 409) }
}
export async function POST(request: Request) { return write(request, true) }
export async function PATCH(request: Request) { return write(request, false) }
