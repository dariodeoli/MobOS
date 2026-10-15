import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { mergePreferences, parsePreferencesPatch, preferencesFrom } from '../../../../lib/tenant-preferences'

// #422 · Preferencias del negocio (procesamiento de pedidos y portal de
// clientes) en Tenant.settings. Leerlas es de cualquier sesión de la empresa;
// cambiarlas, solo del dueño (ADMIN), con auditoría del antes y el después.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  return json(preferencesFrom(tenant?.settings))
}

export async function PUT(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede cambiar estos ajustes.', 403)
  const body = await request.json().catch(() => null)
  const patch = parsePreferencesPatch(body)
  if (!patch) return error('Indicá al menos un ajuste válido (true/false).', 400)
  try {
    const next = await prisma.$transaction(async tx => {
      const current = await tx.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
      const before = preferencesFrom(current?.settings)
      const settings = mergePreferences(current?.settings, patch)
      await tx.tenant.update({ where: { id: session.user.tenantId }, data: { settings: settings as Prisma.InputJsonObject } })
      const after = preferencesFrom(settings)
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_PREFERENCES_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { before, after } as unknown as Prisma.InputJsonObject } })
      return after
    })
    return json({ ok: true, ...next })
  } catch (cause) {
    console.error('[tenant/preferences] no se pudo guardar:', cause)
    return error('No se pudo guardar el ajuste.', 500)
  }
}
