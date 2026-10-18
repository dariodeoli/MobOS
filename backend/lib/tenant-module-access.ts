import { prisma } from './prisma'
import { moduleStoreFrom } from './module-store'

/** Estado por tenant; un setting ausente conserva el acceso histórico. */
export async function tenantModuleEnabled(tenantId: string, moduleId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  if (!tenant) return false
  return moduleStoreFrom(tenant.settings).modules[moduleId]?.enabled === true
}
