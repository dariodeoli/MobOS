import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

// Identidades de facturación del cliente: razones sociales/RUC históricos que
// se pueden volver a usar como datos actuales de factura. La lista autocrea la
// identidad vigente (billingName/billingDocument) para que sea idempotente.
type RouteContext = { params: { id: string } }

const canWrite = (role: string) => ['ADMIN', 'GERENTE', 'VENDEDOR'].includes(role)
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

async function findCustomer(tenant: string, customerId: string) {
  return prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true, name: true, billingName: true, billingDocument: true } })
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const customerId = (params.id || '').trim().slice(0, 128)
  const customer = await findCustomer(tenant, customerId)
  if (!customer) return error('Cliente no encontrado.', 404)
  let identities = await prisma.customerBillingIdentity.findMany({ where: { tenantId: tenant, customerId }, orderBy: [{ uses: 'desc' }, { lastUsedAt: 'desc' }] })
  const billingName = (customer.billingName || '').trim()
  const billingDocument = (customer.billingDocument || '').trim()
  if (billingName && billingDocument && !identities.some(row => row.document === billingDocument)) {
    try {
      const created = await prisma.$transaction(async tx => {
        const identity = await tx.customerBillingIdentity.create({ data: { tenantId: tenant, customerId, name: billingName, document: billingDocument, createdById: session.user.id } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_BILLING_IDENTITY_CREATED', entity: 'Customer', entityId: customerId, metadata: { identityId: identity.id, name: billingName, document: billingDocument, source: 'CURRENT_BILLING' } } })
        return identity
      })
      identities = [...identities, created]
    } catch { /* Otra petición la creó en paralelo: la lista ya la incluye. */ }
  }
  return json(identities)
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const name = text(body?.name, 200)
  const document = text(body?.document, 100)
  if (!name || !document) return error('La razón social y el RUC son obligatorios.')
  if (!(await findCustomer(tenant, customerId))) return error('Cliente no encontrado.', 404)
  try {
    const created = await prisma.$transaction(async tx => {
      const identity = await tx.customerBillingIdentity.create({ data: { tenantId: tenant, customerId, name, document, createdById: session.user.id } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_BILLING_IDENTITY_CREATED', entity: 'Customer', entityId: customerId, metadata: { identityId: identity.id, name, document } } })
      return identity
    })
    return json(created, { status: 201 })
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') return error('Ya existe una identidad con ese RUC para este cliente.', 409)
    return error(cause instanceof Error ? cause.message : 'No se pudo guardar la identidad.')
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id, 128)
  if (!id) return error('Identidad obligatoria.')
  const existing = await prisma.customerBillingIdentity.findFirst({ where: { id, tenantId: tenant, customerId } })
  if (!existing) return error('Identidad no encontrada.', 404)
  const hasName = body?.name !== undefined
  const hasDocument = body?.document !== undefined
  const name = hasName ? text(body?.name, 200) : existing.name
  const document = hasDocument ? text(body?.document, 100) : existing.document
  if (!name || !document) return error('La razón social y el RUC son obligatorios.')
  const useAsCurrent = body?.useAsCurrent === true
  if (!hasName && !hasDocument && !useAsCurrent) return error('No hay cambios para guardar.')
  try {
    const result = await prisma.$transaction(async tx => {
      const identity = hasName || hasDocument
        ? await tx.customerBillingIdentity.update({ where: { id: existing.id }, data: { ...(hasName ? { name } : {}), ...(hasDocument ? { document } : {}) } })
        : existing
      if (useAsCurrent) {
        await tx.customer.update({ where: { id: customerId }, data: { billingName: identity.name, billingDocument: identity.document } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_BILLING_UPDATED', entity: 'Customer', entityId: customerId, metadata: { identityId: identity.id, billingName: identity.name, billingDocument: identity.document } } })
      }
      if (hasName || hasDocument) {
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_BILLING_IDENTITY_UPDATED', entity: 'Customer', entityId: customerId, metadata: { identityId: identity.id, name: identity.name, document: identity.document } } })
      }
      return identity
    })
    return json(result)
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') return error('Ya existe una identidad con ese RUC para este cliente.', 409)
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la identidad.')
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const customerId = (params.id || '').trim().slice(0, 128)
  const id = text(new URL(request.url).searchParams.get('id'), 128)
  if (!id) return error('Identidad obligatoria.')
  const existing = await prisma.customerBillingIdentity.findFirst({ where: { id, tenantId: tenant, customerId } })
  if (!existing) return error('Identidad no encontrada.', 404)
  try {
    await prisma.$transaction(async tx => {
      await tx.customerBillingIdentity.delete({ where: { id: existing.id } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_BILLING_IDENTITY_DELETED', entity: 'Customer', entityId: customerId, metadata: { identityId: existing.id, name: existing.name, document: existing.document } } })
    })
    return json({ ok: true })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo eliminar la identidad.', 409) }
}
