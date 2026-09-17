import type { Prisma } from '@prisma/client'

// Código comercial corto y legible para humanos (MOB-#0001). El id interno
// (UUID) sigue siendo el que relaciona pedidos, pagos y accesos públicos.
const ORDER_NUMBER_PREFIX = 'MOB-#'
const ORDER_NUMBER_MAX = 99999999

export async function nextOrderNumber(tx: Prisma.TransactionClient, tenant: string) {
  // El máximo se compara como número, no como texto: al pasar los 4 dígitos
  // (MOB-#10000) el orden alfabético dejaría de coincidir con el secuencial.
  const [ultimo] = await tx.$queryRaw<Array<{ max: bigint | null }>>`
    SELECT MAX(CAST(SUBSTRING("orderNumber" FROM 6) AS BIGINT)) AS max
    FROM "Order"
    WHERE "tenantId" = ${tenant} AND "orderNumber" ~ '^MOB-#[0-9]+$'
  `
  const secuencia = Number(ultimo?.max ?? 0n)
  if (!Number.isSafeInteger(secuencia) || secuencia >= ORDER_NUMBER_MAX) throw new Error('Se agotó la numeración de pedidos.')
  return `${ORDER_NUMBER_PREFIX}${String(secuencia + 1).padStart(4, '0')}`
}

// Dos ventas simultáneas pueden calcular el mismo número; el índice único
// rechaza la segunda y el POST se reintenta con el siguiente.
export const esCodigoDuplicado = (e: unknown) => (e as { code?: string })?.code === 'P2002'
  && JSON.stringify((e as { meta?: unknown })?.meta ?? {}).includes('orderNumber')
