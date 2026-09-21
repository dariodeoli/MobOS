import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

// Empresas/personas jurídicas con datos privados (#143): nombre legal, RUC y
// dirección legal, separadas del perfil público de la tienda. Solo el dueño
// (ADMIN) las gestiona y las ve; se usan como titular de cuentas de cobro.

type CompanyData = { legalName?: string; ruc?: string | null; legalAddress?: string | null; notes?: string | null; isActive?: boolean }

function companyData(input: Record<string, unknown>, create: boolean) {
  const data: CompanyData = {}
  if (create || input.legalName !== undefined) data.legalName = textInput(input.legalName, 'legalName', 200)
  for (const [field, max] of [['ruc', 32], ['legalAddress', 400], ['notes', 1000]] as const) {
    if (input[field] !== undefined) data[field] = input[field] === null || input[field] === '' ? null : textInput(input[field], field, max)
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
  return json(await prisma.privateCompany.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { legalName: 'asc' },
  }))
}

async function write(request: Request, create: boolean) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const data = companyData(body, create)
    const tenantId = session.user.tenantId
    const result = await prisma.$transaction(async tx => {
      if (create) {
        const company = await tx.privateCompany.create({ data: { ...data, tenantId, legalName: data.legalName! } })
        await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRIVATE_COMPANY_CREATED', entity: 'PrivateCompany', entityId: company.id, metadata: { after: { legalName: company.legalName, ruc: company.ruc } } } })
        return company
      }
      const id = textInput(body.id, 'id', 200)
      const before = await tx.privateCompany.findFirst({ where: { id, tenantId } })
      if (!before) throw new InputError('Empresa no encontrada.', 404)
      if (!Object.keys(data).length) throw new InputError('Faltan cambios.')
      const company = await tx.privateCompany.update({ where: { id }, data })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRIVATE_COMPANY_UPDATED', entity: 'PrivateCompany', entityId: id, metadata: { before: { legalName: before.legalName, ruc: before.ruc }, after: { legalName: company.legalName, ruc: company.ruc } } } })
      return company
    })
    return json(result, { status: create ? 201 : 200 })
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se pudo guardar la empresa.', e instanceof InputError ? e.status : e instanceof SyntaxError ? 400 : 409)
  }
}

export async function POST(request: Request) { return write(request, true) }
export async function PATCH(request: Request) { return write(request, false) }
