import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

const TIPOS = ['WHOLESALE', 'CREDIT']
const INT_MAX = 2147483647
const safeInt = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= INT_MAX
const puedeResolver = (role: string) => ['ADMIN', 'GERENTE'].includes(role)

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const status = new URL(request.url).searchParams.get('status') || ''
  const where = {
    tenantId: tenant,
    ...(status ? { status } : {}),
    ...(session.user.role === 'VENDEDOR' ? { requestedBy: session.user.id } : {}),
  }
  const requests = await prisma.customerRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
  return json(requests)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = objectInput(await request.json())
    const customerId = textInput(body.customerId, 'Cliente', 200)
    const type = typeof body.type === 'string' && TIPOS.includes(body.type) ? body.type : ''
    if (!type) throw new InputError('Tipo de solicitud inválido.')
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true, name: true } })
    if (!customer) throw new InputError('Cliente no encontrado.', 404)
    const pendiente = await prisma.customerRequest.findFirst({ where: { tenantId: tenant, customerId, type, status: 'PENDING' }, select: { id: true } })
    if (pendiente) throw new InputError('Ya hay una solicitud pendiente de ese tipo para este cliente.')
    const creditDays = body.creditDays === undefined || body.creditDays === '' || body.creditDays === null ? null : Number(body.creditDays)
    const creditLimitPyg = body.creditLimitPyg === undefined || body.creditLimitPyg === '' || body.creditLimitPyg === null ? null : Number(body.creditLimitPyg)
    if (creditDays !== null && (!Number.isSafeInteger(creditDays) || creditDays < 0 || creditDays > 365)) throw new InputError('Plazo de crédito inválido (0 a 365 días).')
    if (creditLimitPyg !== null && !safeInt(creditLimitPyg)) throw new InputError('Límite de crédito inválido.')
    const creada = await prisma.customerRequest.create({
      data: {
        tenantId: tenant,
        customerId: customer.id,
        customerName: customer.name,
        type,
        requestedBy: session.user.id,
        requestedByName: session.user.name,
        requestedPricingTier: type === 'WHOLESALE' ? 'WHOLESALE' : null,
        requestedCreditDays: creditDays,
        requestedCreditLimitPyg: creditLimitPyg,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null,
      },
    })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_REQUEST_CREATED', entity: 'Customer', entityId: customer.id, metadata: { requestId: creada.id, type, creditDays, creditLimitPyg } } })
    return json(creada, { status: 201 })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo crear la solicitud.', 400)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!puedeResolver(session.user.role)) return error('Solo administración o gerencia pueden resolver solicitudes.', 403)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'Solicitud', 200)
    const aprobar = body.approve === true
    const existing = await prisma.customerRequest.findFirst({ where: { id, tenantId: tenant } })
    if (!existing) return error('Solicitud no encontrada.', 404)
    if (existing.status !== 'PENDING') throw new InputError('La solicitud ya fue resuelta.')
    const creditDays = body.creditDays === undefined || body.creditDays === '' || body.creditDays === null ? existing.requestedCreditDays : Number(body.creditDays)
    const creditLimitPyg = body.creditLimitPyg === undefined || body.creditLimitPyg === '' || body.creditLimitPyg === null ? existing.requestedCreditLimitPyg : Number(body.creditLimitPyg)
    if (aprobar && creditDays !== null && (!Number.isSafeInteger(creditDays) || creditDays < 0 || creditDays > 365)) throw new InputError('Plazo autorizado inválido.')
    if (aprobar && creditLimitPyg !== null && !safeInt(creditLimitPyg)) throw new InputError('Límite autorizado inválido.')

    const result = await prisma.$transaction(async tx => {
      const resolved = await tx.customerRequest.update({
        where: { id: existing.id },
        data: {
          status: aprobar ? 'APPROVED' : 'REJECTED',
          resolvedBy: session.user.id,
          resolvedByName: session.user.name,
          resolvedAt: new Date(),
          ...(aprobar
            ? {
                approvedPricingTier: existing.type === 'WHOLESALE' ? 'WHOLESALE' : null,
                approvedCreditDays: existing.type === 'CREDIT' ? creditDays : null,
                approvedCreditLimitPyg: existing.type === 'CREDIT' ? creditLimitPyg : null,
              }
            : {}),
          ...(typeof body.note === 'string' && body.note.trim() ? { note: body.note.trim().slice(0, 1000) } : {}),
        },
      })
      if (aprobar) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: {
            ...(existing.type === 'WHOLESALE' ? { pricingTier: 'WHOLESALE' } : {}),
            ...(existing.type === 'CREDIT' ? { creditDays, creditLimitPyg } : {}),
          },
        })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: aprobar ? 'CUSTOMER_REQUEST_APPROVED' : 'CUSTOMER_REQUEST_REJECTED', entity: 'Customer', entityId: existing.customerId, metadata: { requestId: existing.id, type: existing.type, creditDays: aprobar ? creditDays : null, creditLimitPyg: aprobar ? creditLimitPyg : null } } })
      return resolved
    })
    return json(result)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo resolver la solicitud.', 400)
  }
}
