// #286 · Sucursal efectiva: la regla de Dario para un usuario **sin sucursal
// asignada** — se queda con la **última que usó**; si no usó ninguna, la
// **primera sucursal creada** de la empresa. El usuario con sucursal asignada
// conserva la suya (el selector de sucursal es el que la cambia).
//
// La resolución se usa donde el POS resuelve la sucursal para el catálogo, las
// unidades y la venta, para que un vendedor sin sucursal quede operativo.
import { prisma } from './prisma'
import { ensureStoreBranch } from './store-branch'
import type { SessionContext } from './auth'

/** Regla pura (testeable): asignada → última usada → primera creada. */
export function reglaSucursalEfectiva({ asignada = null, ultima = null, primera = null }: { asignada?: string | null; ultima?: string | null; primera?: string | null }) {
  return asignada || ultima || primera || null
}

/** Última sucursal usada por el usuario que siga activa. */
export async function ultimaSucursalUsada({ tenantId, userId }: { tenantId: string; userId: string }) {
  const usos = await prisma.userBranchUsage.findMany({ where: { tenantId, userId, branch: { isActive: true } }, orderBy: { usedAt: 'desc' }, take: 5, select: { branchId: true } })
  return usos[0]?.branchId || null
}

/** Registra el uso de una sucursal (base de «la última que usó»). */
export async function recordarSucursalUsada({ tenantId, userId, branchId }: { tenantId: string; userId: string; branchId: string | null | undefined }) {
  if (!branchId) return
  try {
    await prisma.userBranchUsage.upsert({
      where: { userId_branchId: { userId, branchId } },
      // usedAt explícito: el DEFAULT de la base guarda hora local y la mezcla
      // con la hora UTC de Prisma rompería el orden de «última usada».
      create: { tenantId, userId, branchId, usedAt: new Date() },
      update: { usedAt: new Date() },
    })
  } catch { /* best-effort: no frena la operación */ }
}

/** Primera sucursal creada del tenant (fallback de la regla). */
export async function primeraSucursal({ tenantId }: { tenantId: string }) {
  const branch = await prisma.branch.findFirst({ where: { tenantId, isActive: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } })
  return branch?.id || null
}

/**
 * Sucursal con la que opera el usuario: la asignada, si no la última usada y si
 * no la primera creada (con la persistencia/creación que ya hacía
 * `ensureStoreBranch`). Registra el uso para que la preferencia quede pegada.
 */
export async function sucursalEfectiva(session: SessionContext): Promise<string | null> {
  const asignada = await ensureStoreBranch(session)
  // Con sucursal asignada la preferencia no aplica: la asignada manda.
  if (asignada) return asignada
  const ultima = await ultimaSucursalUsada({ tenantId: session.user.tenantId, userId: session.user.id })
  const primera = ultima ? null : await primeraSucursal({ tenantId: session.user.tenantId })
  const efectiva = reglaSucursalEfectiva({ asignada, ultima, primera })
  // La preferencia se refresca solo cuando cambia: nada de escrituras por request.
  if (efectiva && efectiva !== ultima) await recordarSucursalUsada({ tenantId: session.user.tenantId, userId: session.user.id, branchId: efectiva })
  return efectiva
}
