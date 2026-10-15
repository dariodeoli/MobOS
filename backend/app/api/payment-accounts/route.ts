import { Prisma, type PaymentAccountKind, type PaymentCurrency } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { accountSnapshot, decimalInput, InputError, objectInput, textInput } from '../../../lib/payment-input'

function accountData(input: Record<string, unknown>, create: boolean) {
  const data: { name?: string; bank?: string | null; holder?: string | null; accountNumber?: string | null; document?: string | null; processor?: string | null; pixKey?: string | null; aliasType?: string | null; aliasValue?: string | null; reference?: string | null; currencyLabel?: string | null; holderId?: string | null; companyId?: string | null; currency?: PaymentCurrency; kind?: PaymentAccountKind; isActive?: boolean; feePercent?: Prisma.Decimal; discountPct?: Prisma.Decimal; settlementDays?: number } = {}
  if (create || input.name !== undefined) data.name = textInput(input.name, 'name', 200)
  for (const field of ['bank', 'holder', 'accountNumber', 'document', 'processor', 'pixKey', 'reference', 'currencyLabel'] as const) {
    if (input[field] !== undefined) data[field] = input[field] === null || input[field] === '' ? null : textInput(input[field], field, field === 'currencyLabel' ? 12 : 200)
  }
  if (input.aliasType !== undefined) {
    if (input.aliasType === null || input.aliasType === '') data.aliasType = null
    else if (['RUC', 'EMAIL', 'PHONE', 'OTHER'].includes(input.aliasType as string)) data.aliasType = input.aliasType as string
    else throw new InputError('Tipo de alias inválido.')
  }
  if (input.aliasValue !== undefined) data.aliasValue = input.aliasValue === null || input.aliasValue === '' ? null : textInput(input.aliasValue, 'aliasValue', 200)
  if (data.aliasValue === null) data.aliasType = null
  if (create || input.currency !== undefined) {
    if (!['PYG', 'USD', 'BRL', 'EUR', 'USDT'].includes(input.currency as string)) throw new InputError('Moneda inválida.')
    data.currency = input.currency as PaymentCurrency
  }
  if (create || input.kind !== undefined) {
    if (!['CASH', 'TRANSFER', 'CARD', 'TRADE_IN', 'PIX', 'CRYPTO'].includes(input.kind as string)) throw new InputError('Tipo de cuenta inválido. CREDIT solo es un método legacy.')
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
  if (input.discountPct !== undefined) {
    // Descuento sugerido al cobrar con este medio (0–100, hasta 2 decimales).
    // Vacío equivale a sin descuento (la columna es NOT NULL DEFAULT 0).
    if (input.discountPct === null || input.discountPct === '') data.discountPct = new Prisma.Decimal(0)
    else {
      data.discountPct = decimalInput(input.discountPct, 'discountPct', 2, true)
      if (data.discountPct.gt(100)) throw new InputError('discountPct debe estar entre 0 y 100.')
    }
  }
  if (input.settlementDays !== undefined) {
    const days = Number(input.settlementDays)
    if (!Number.isSafeInteger(days) || days < 0 || days > 90) throw new InputError('settlementDays debe estar entre 0 y 90 días.')
    data.settlementDays = days
  }
  return data
}

function validateTransfer(account: { kind?: PaymentAccountKind; bank?: string | null; holder?: string | null; accountNumber?: string | null }, requireDetails: boolean) {
  if (account.kind !== 'TRANSFER') return
  // El banco identifica la transferencia. Titular y número se exigen al crear
  // (alta completa), no al editar: las cuentas predeterminadas (#118) llegan
  // como esqueleto y el usuario las nombra y completa después; desactivarlas o
  // renombrarlas no puede quedar bloqueado por datos que todavía no cargó.
  textInput(account.bank, 'bank', 200)
  if (!requireDetails) return
  textInput(account.holder, 'holder', 200)
  textInput(account.accountNumber, 'accountNumber', 200)
}

// Cada medio tiene su moneda (#142): Pix cobra en reales y Cripto/USDT en
// dólares. La transferencia no mezcla USDT: la cripto tiene su propio medio.
function validateCurrency(kind: PaymentAccountKind | undefined, currency: PaymentCurrency | undefined) {
  if (kind === 'PIX' && currency !== 'BRL') throw new InputError('Pix cobra en reales (BRL).')
  if (kind === 'CRYPTO' && currency !== 'USD') throw new InputError('Cripto/USDT cobra en dólares (USD).')
  if (kind === 'TRANSFER' && currency === 'USDT') throw new InputError('USDT tiene su propio medio: usá una cuenta USDT - Cripto.')
}

// Titular y empresa asociados (#143): solo se aceptan si existen en la empresa.
async function validarPartes(tx: Prisma.TransactionClient, tenantId: string, data: Record<string, unknown>, body: Record<string, unknown>) {
  if (body.holderId !== undefined) {
    if (body.holderId === null || body.holderId === '') data.holderId = null
    else {
      const id = textInput(body.holderId, 'holderId', 200)
      if (!(await tx.accountHolder.findFirst({ where: { id, tenantId }, select: { id: true } }))) throw new InputError('El titular no existe en la empresa.')
      data.holderId = id
    }
  }
  if (body.companyId !== undefined) {
    if (body.companyId === null || body.companyId === '') data.companyId = null
    else {
      const id = textInput(body.companyId, 'companyId', 200)
      if (!(await tx.privateCompany.findFirst({ where: { id, tenantId }, select: { id: true } }))) throw new InputError('La empresa no existe.')
      data.companyId = id
    }
  }
}

// #486: leer cuentas nunca crea datos; cada empresa configura sus medios reales.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const retired = await prisma.auditLog.findMany({ where: { tenantId, entity: 'PaymentAccount', action: 'PAYMENT_ACCOUNT_DEFAULT_RETIRED' }, select: { entityId: true } })
  const retiredIds = retired.map(row => row.entityId).filter((id): id is string => Boolean(id))
  return json(await prisma.paymentAccount.findMany({ where: { tenantId, ...(retiredIds.length ? { id: { notIn: retiredIds } } : {}), ...(session.user.role === 'ADMIN' ? {} : { isActive: true }) }, orderBy: { name: 'asc' } }))
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
      await validarPartes(tx, tenantId, data, body)
      if (create) {
        validateTransfer(data, true)
        validateCurrency(data.kind, data.currency)
        const account = await tx.paymentAccount.create({ data: { ...data, tenantId, name: data.name!, currency: data.currency!, kind: data.kind! } })
        await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PAYMENT_ACCOUNT_CREATED', entity: 'PaymentAccount', entityId: account.id, metadata: { after: accountSnapshot(account) } } })
        return account
      }
      const id = textInput(body.id, 'id', 200)
      await tx.$queryRaw`SELECT "id" FROM "PaymentAccount" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const retired = await tx.auditLog.findFirst({ where: { tenantId, entity: 'PaymentAccount', entityId: id, action: 'PAYMENT_ACCOUNT_DEFAULT_RETIRED' }, select: { id: true } })
      if (retired) throw new InputError('Esta cuenta de ejemplo fue retirada. Creá una cuenta con los datos reales de tu empresa.', 409)
      const before = await tx.paymentAccount.findFirst({ where: { id, tenantId } })
      if (!before) throw new InputError('Cuenta no encontrada.', 404)
      if (!Object.keys(data).length) throw new InputError('Faltan cambios.')
      validateTransfer({ ...before, ...data }, false)
      validateCurrency(data.kind ?? before.kind, data.currency ?? before.currency)
      const account = await tx.paymentAccount.update({ where: { id }, data })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PAYMENT_ACCOUNT_UPDATED', entity: 'PaymentAccount', entityId: id, metadata: { before: accountSnapshot(before), after: accountSnapshot(account) } } })
      return account
    })
    return json(result, { status: create ? 201 : 200 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo guardar la cuenta.', e instanceof InputError ? e.status : e instanceof SyntaxError ? 400 : 409) }
}
export async function POST(request: Request) { return write(request, true) }
export async function PATCH(request: Request) { return write(request, false) }
