import type { Prisma } from '@prisma/client'

// Número de orden de servicio técnico: `OS-#0001` por tienda, derivado del
// máximo existente (mismo criterio que los pedidos: el id interno sigue siendo
// el que relaciona todo).
export const SERVICE_NUMBER_PREFIX = 'OS'

export const formatServiceNumber = (sequence: number) => `${SERVICE_NUMBER_PREFIX}-#${String(sequence).padStart(4, '0')}`

export async function maxServiceSequence(tx: Prisma.TransactionClient, tenant: string) {
  const [ultimo] = await tx.$queryRaw<Array<{ max: bigint | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("serviceNumber" FROM length(${SERVICE_NUMBER_PREFIX}) + 3) AS BIGINT)), 0) AS max
    FROM "ServiceOrder"
    WHERE "tenantId" = ${tenant} AND "serviceNumber" ~ ('^' || ${SERVICE_NUMBER_PREFIX} || '-#[0-9]+$')
  `
  return Number(ultimo?.max ?? 0n)
}

export async function nextServiceNumber(tx: Prisma.TransactionClient, tenant: string) {
  return formatServiceNumber((await maxServiceSequence(tx, tenant)) + 1)
}
