import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { invalidatePaymentCorrectionPolicy, staffCorrectsPaymentsFrom } from '../../../../lib/payment-correction-policy'

// Ajuste del negocio: ¿caja y vendedores corrigen el medio de pago de sus propios
// cobros del turno abierto? Vive en Tenant.settings.permissions.staffCorrectsPayments
// (por defecto sí). Leerlo es de cualquier sesión; cambiarlo, solo del dueño
// (ADMIN), con auditoría.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  return json({ staffCorrectsPayments: staffCorrectsPaymentsFrom(tenant?.settings) })
}

export async function PUT(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede cambiar este permiso.', 403)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.staffCorrectsPayments !== 'boolean') return error('Indicá si caja y vendedores corrigen pagos (true/false).', 400)
  const next = body.staffCorrectsPayments
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
      const settings = current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings) ? current.settings as Record<string, unknown> : {}
      const permissions = settings.permissions && typeof settings.permissions === 'object' && !Array.isArray(settings.permissions) ? settings.permissions as Record<string, unknown> : {}
      const before = staffCorrectsPaymentsFrom(settings)
      await tx.tenant.update({ where: { id: session.user.tenantId }, data: { settings: { ...settings, permissions: { ...permissions, staffCorrectsPayments: next } } as Prisma.InputJsonObject } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_PAYMENT_CORRECTION_POLICY_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { before, after: next } } })
    })
  } catch (cause) {
    console.error('[tenant/payment-correction-policy] no se pudo guardar:', cause)
    return error('No se pudo guardar el permiso.', 500)
  }
  invalidatePaymentCorrectionPolicy(session.user.tenantId)
  return json({ ok: true, staffCorrectsPayments: next })
}
