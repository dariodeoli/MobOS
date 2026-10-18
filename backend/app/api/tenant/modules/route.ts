import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { MODULE_CATALOG, MODULE_PRESETS, mergeModuleStoreSettings, moduleStoreFrom, parseModuleChange, updateModuleStore } from '../../../../lib/module-store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  if (!tenant) return error('Empresa no encontrada.', 404)
  return json({ catalogVersion: 1, catalog: MODULE_CATALOG, presets: MODULE_PRESETS, state: moduleStoreFrom(tenant.settings), canManage: session.user.role === 'ADMIN' }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede modificar los módulos.', 403)
  const change = parseModuleChange(await request.json().catch(() => null))
  if (!change) return error('Cambio de módulo inválido.', 400)
  try {
    const state = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${session.user.tenantId} FOR UPDATE`
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId }, select: { settings: true } })
      const before = moduleStoreFrom(tenant.settings)
      const after = updateModuleStore(tenant.settings, change)
      await tx.tenant.update({ where: { id: session.user.tenantId }, data: { settings: mergeModuleStoreSettings(tenant.settings, after) } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_MODULES_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { before, after, change } as unknown as Prisma.InputJsonObject } })
      return after
    })
    return json({ ok: true, state })
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'MODULE_DEPENDENCY_REQUIRED') return error('Activá primero los módulos requeridos.', 409)
    if (cause instanceof Error && cause.message === 'MODULE_HAS_ENABLED_DEPENDENTS') return error('Desactivá primero los módulos que dependen de este.', 409)
    if (cause instanceof Error && cause.message === 'MODULE_CHANGE_NOT_ALLOWED') return error('Este módulo no se puede cambiar.', 409)
    console.error('[tenant/modules] no se pudo guardar:', cause)
    return error('No se pudieron guardar los módulos.', 500)
  }
}
