import { Prisma, type PaymentAccountKind, type PaymentCurrency } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { accountSnapshot, decimalInput, InputError, objectInput, textInput } from '../../../lib/payment-input'

function accountData(input: Record<string, unknown>, create: boolean) {
  const data: { name?: string; bank?: string | null; holder?: string | null; accountNumber?: string | null; document?: string | null; processor?: string | null; pixKey?: string | null; reference?: string | null; currencyLabel?: string | null; currency?: PaymentCurrency; kind?: PaymentAccountKind; isActive?: boolean; feePercent?: Prisma.Decimal; discountPct?: Prisma.Decimal; settlementDays?: number } = {}
  if (create || input.name !== undefined) data.name = textInput(input.name, 'name', 200)
  for (const field of ['bank', 'holder', 'accountNumber', 'document', 'processor', 'pixKey', 'reference', 'currencyLabel'] as const) {
    if (input[field] !== undefined) data[field] = input[field] === null || input[field] === '' ? null : textInput(input[field], field, field === 'currencyLabel' ? 12 : 200)
  }
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
// dólares. El resto (efectivo multinmoneda incluido) elige libremente.
function validateCurrency(kind: PaymentAccountKind | undefined, currency: PaymentCurrency | undefined) {
  if (kind === 'PIX' && currency !== 'BRL') throw new InputError('Pix cobra en reales (BRL).')
  if (kind === 'CRYPTO' && currency !== 'USD') throw new InputError('Cripto/USDT cobra en dólares (USD).')
}

// Cuentas predeterminadas (#118): los medios con logo de
// src/components/shared/MedioPago.jsx, en el orden de la lista canónica
// MEDIOS_PAGO (src/lib/catalog.js). La marca vive en `bank` —el logo se mapea
// por banco— y `name` repite la marca como default previsible porque el modelo
// exige nombre no vacío: el usuario lo reemplaza por el suyo desde la pantalla.
// Nacen como esqueleto (sin titular ni número): el usuario completa esos datos
// cuando los tenga y la validación de transferencias no bloquea el renombre.
// El tipo es el uso esperado de cada medio y queda editable: bancos y billeteras
// acreditan por transferencia, los adquirentes de tarjeta por tarjeta y el
// billete es efectivo.
const DEFAULT_ACCOUNTS: Array<{ brand: string; kind: PaymentAccountKind }> = [
  { brand: 'UENO BANK', kind: 'TRANSFER' },
  { brand: 'POS UENO', kind: 'CARD' },
  { brand: 'PIK ITAÚ', kind: 'TRANSFER' },
  { brand: 'DINELCO', kind: 'CARD' },
  { brand: 'DINERO', kind: 'CASH' },
  { brand: 'CONTINENTAL', kind: 'TRANSFER' },
  { brand: 'FAMILIAR', kind: 'TRANSFER' },
]

// Siembra perezosa: la empresa que todavía no tiene ninguna cuenta recibe las
// predeterminadas una sola vez. Idempotente: el lock por empresa y el conteo
// bajo lock evitan duplicados por marca ante lecturas simultáneas.
async function seedDefaultAccounts(tenantId: string) {
  if (await prisma.paymentAccount.count({ where: { tenantId } }) > 0) return
  await prisma.$transaction(async tx => {
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`
    if (await tx.paymentAccount.count({ where: { tenantId } }) > 0) return
    for (const { brand, kind } of DEFAULT_ACCOUNTS) {
      const account = await tx.paymentAccount.create({ data: { tenantId, name: brand, bank: brand, currency: 'PYG', kind, isActive: true } })
      await tx.auditLog.create({ data: { tenantId, userId: null, action: 'PAYMENT_ACCOUNT_CREATED', entity: 'PaymentAccount', entityId: account.id, metadata: { after: accountSnapshot(account), seeded: true } } })
    }
  })
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  await seedDefaultAccounts(tenantId)
  return json(await prisma.paymentAccount.findMany({ where: { tenantId, ...(session.user.role === 'ADMIN' ? {} : { isActive: true }) }, orderBy: { name: 'asc' } }))
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
        validateTransfer(data, true)
        validateCurrency(data.kind, data.currency)
        const account = await tx.paymentAccount.create({ data: { ...data, tenantId, name: data.name!, currency: data.currency!, kind: data.kind! } })
        await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PAYMENT_ACCOUNT_CREATED', entity: 'PaymentAccount', entityId: account.id, metadata: { after: accountSnapshot(account) } } })
        return account
      }
      const id = textInput(body.id, 'id', 200)
      await tx.$queryRaw`SELECT "id" FROM "PaymentAccount" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`
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
