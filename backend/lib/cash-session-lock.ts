import type { Prisma } from '@prisma/client'

/** Serializa apertura, cierre y ajustes del mismo cajón, incluso sin turno abierto.
 * Se toma antes de CashSession; todos los instantes de corte se fijan después.
 * JSON conserva los límites entre ids; una colisión hash solo serializa de más.
 */
export async function lockCashSessionDomain(tx: Prisma.TransactionClient, tenantId: string, branchId: string, collectorId: string) {
  const domain = JSON.stringify(['cash-session', tenantId, branchId, collectorId])
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${domain}, 0))::text`
}
