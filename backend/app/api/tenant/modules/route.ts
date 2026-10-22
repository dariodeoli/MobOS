import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { MODULE_CATALOG, MODULE_PRESETS, mergeModuleStoreSettings, moduleStoreFrom, parseModuleChange, updateModuleStore } from '../../../../lib/module-store'
import { esDuenoReal } from '../../../../lib/modulos-guard'
import { mensajeSaldos, saldosAbiertos, type SaldoAbierto } from '../../../../lib/modulos-saldos'

export const dynamic = 'force-dynamic'

class SaldosAbiertosError extends Error {
  constructor(readonly saldos: SaldoAbierto[]) { super('MODULE_OPEN_BALANCES') }
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  if (!tenant) return error('Empresa no encontrada.', 404)
  // canManage: solo el dueño real de la empresa puede cambiar módulos (no cualquier ADMIN).
  return json({ catalogVersion: 2, catalog: MODULE_CATALOG, presets: MODULE_PRESETS, state: moduleStoreFrom(tenant.settings), canManage: await esDuenoReal(request, session) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!await esDuenoReal(request, session)) return error('Solo el dueño de la empresa puede modificar los módulos.', 403)
  const change = parseModuleChange(await request.json().catch(() => null))
  if (!change) return error('Cambio de módulo inválido.', 400)
  try {
    const state = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${session.user.tenantId} FOR UPDATE`
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId }, select: { settings: true } })
      const before = moduleStoreFrom(tenant.settings)
      const after = updateModuleStore(tenant.settings, change)
      // [PLATA] Nunca se apaga un módulo con plata o equipos pendientes: se revisa dentro de la
      // misma transacción (con la empresa bloqueada) para que nada cambie entre el chequeo y el guardado.
      const apagados = MODULE_CATALOG.filter(module => before.modules[module.id]?.enabled && !after.modules[module.id]?.enabled).map(module => module.id)
      const saldos = await saldosAbiertos(tx, session.user.tenantId, apagados)
      if (saldos.length) throw new SaldosAbiertosError(saldos)
      await tx.tenant.update({ where: { id: session.user.tenantId }, data: { settings: mergeModuleStoreSettings(tenant.settings, after) } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_MODULES_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { before, after, change } as unknown as Prisma.InputJsonObject } })
      return after
    })
    return json({ ok: true, state })
  } catch (cause) {
    if (cause instanceof SaldosAbiertosError) return error(mensajeSaldos(cause.saldos), 409, { code: 'MODULE_OPEN_BALANCES', saldos: cause.saldos })
    if (cause instanceof Error && cause.message === 'MODULE_DEPENDENCY_REQUIRED') return error('Activá primero los módulos requeridos.', 409)
    if (cause instanceof Error && cause.message === 'MODULE_HAS_ENABLED_DEPENDENTS') return error('Desactivá primero los módulos que dependen de este.', 409)
    if (cause instanceof Error && cause.message === 'MODULE_CHANGE_NOT_ALLOWED') return error('Este módulo no se puede cambiar.', 409)
    console.error('[tenant/modules] no se pudo guardar:', cause)
    return error('No se pudieron guardar los módulos.', 500)
  }
}
