import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

// Titulares/socios de las cuentas de cobro (#143). Datos privados: solo el
// dueño (ADMIN) los gestiona y los ve. El nombre se compone en la pantalla
// (1º nombre → 2º → 3º → 1º apellido → 2º apellido).

type HolderData = { firstName?: string; middleName?: string | null; otherName?: string | null; lastName?: string; secondLastName?: string | null; document?: string | null; isActive?: boolean }

function holderData(input: Record<string, unknown>, create: boolean) {
  const data: HolderData = {}
  if (create || input.firstName !== undefined) data.firstName = textInput(input.firstName, 'firstName', 80)
  if (create || input.lastName !== undefined) data.lastName = textInput(input.lastName, 'lastName', 80)
  for (const field of ['middleName', 'otherName', 'secondLastName', 'document'] as const) {
    if (input[field] !== undefined) data[field] = input[field] === null || input[field] === '' ? null : textInput(input[field], field, field === 'document' ? 32 : 80)
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') throw new InputError('isActive debe ser booleano.')
    data.isActive = input.isActive
  }
  return data
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  return json(await prisma.accountHolder.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  }))
}

async function write(request: Request, create: boolean) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const data = holderData(body, create)
    const tenantId = session.user.tenantId
    const result = await prisma.$transaction(async tx => {
      if (create) {
        const holder = await tx.accountHolder.create({ data: { ...data, tenantId, firstName: data.firstName!, lastName: data.lastName! } })
        await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'ACCOUNT_HOLDER_CREATED', entity: 'AccountHolder', entityId: holder.id, metadata: { after: { firstName: holder.firstName, lastName: holder.lastName, document: holder.document } } } })
        return holder
      }
      const id = textInput(body.id, 'id', 200)
      const before = await tx.accountHolder.findFirst({ where: { id, tenantId } })
      if (!before) throw new InputError('Titular no encontrado.', 404)
      if (!Object.keys(data).length) throw new InputError('Faltan cambios.')
      const holder = await tx.accountHolder.update({ where: { id }, data })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'ACCOUNT_HOLDER_UPDATED', entity: 'AccountHolder', entityId: id, metadata: { before: { firstName: before.firstName, lastName: before.lastName, document: before.document }, after: { firstName: holder.firstName, lastName: holder.lastName, document: holder.document } } } })
      return holder
    })
    return json(result, { status: create ? 201 : 200 })
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se pudo guardar el titular.', e instanceof InputError ? e.status : e instanceof SyntaxError ? 400 : 409)
  }
}

export async function POST(request: Request) { return write(request, true) }
export async function PATCH(request: Request) { return write(request, false) }
