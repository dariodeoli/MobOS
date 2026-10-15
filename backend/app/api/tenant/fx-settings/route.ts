import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { FX_SOURCES, fxSettingsFrom, validateFxSettings } from '../../../../lib/fx'

// Ajuste del negocio: fuente y lado de la cotización para cobros y costos
// (Tenant.settings.fx, sin migración). Leerlo es de cualquier sesión; cambiarlo,
// solo del dueño (ADMIN), con auditoría.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  return json({ ...fxSettingsFrom(tenant?.settings), sources: Object.entries(FX_SOURCES).map(([id, label]) => ({ id, label })) })
}

export async function PUT(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede cambiar la fuente de cotización.', 403)
  const body = await request.json().catch(() => null)
  const parsed = validateFxSettings(body)
  if (!parsed.ok) return error(parsed.error, 400)
  const next = parsed.value
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
      const settings = current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings) ? current.settings as Record<string, unknown> : {}
      const before = fxSettingsFrom(settings)
      await tx.tenant.update({ where: { id: session.user.tenantId }, data: { settings: { ...settings, fx: next } as Prisma.InputJsonObject } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_FX_SETTINGS_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { before, after: next } } })
    })
  } catch (cause) {
    console.error('[tenant/fx-settings] no se pudo guardar:', cause)
    return error('No se pudo guardar la fuente de cotización.', 500)
  }
  return json({ ok: true, ...next })
}
