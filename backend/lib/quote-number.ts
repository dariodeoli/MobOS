import type { Prisma } from '@prisma/client'

// Código comercial corto y legible para cotizaciones (COT-#0001). Antes era
// `COT-<timestamp base36>`, que no se puede dictar ni leer. El id interno
// (cuid) sigue siendo el que relaciona la cotización con el pedido.
const QUOTE_NUMBER_PREFIX = 'COT-#'
const QUOTE_NUMBER_MAX = 99999999

export async function nextQuoteNumber(tx: Prisma.TransactionClient, tenant: string) {
  // El máximo se compara como número, no como texto: al pasar los 4 dígitos
  // (COT-#10000) el orden alfabético dejaría de coincidir con el secuencial.
  const [ultimo] = await tx.$queryRaw<Array<{ max: bigint | null }>>`
    SELECT MAX(CAST(SUBSTRING("number" FROM 6) AS BIGINT)) AS max
    FROM "Quote"
    WHERE "tenantId" = ${tenant} AND "number" ~ '^COT-#[0-9]+$'
  `
  const secuencia = Number(ultimo?.max ?? 0n)
  if (!Number.isSafeInteger(secuencia) || secuencia >= QUOTE_NUMBER_MAX) throw new Error('Se agotó la numeración de cotizaciones.')
  return `${QUOTE_NUMBER_PREFIX}${String(secuencia + 1).padStart(4, '0')}`
}

// Dos cotizaciones simultáneas pueden calcular el mismo número; el índice
// único rechaza la segunda y el POST se reintenta con el siguiente.
export const esNumeroCotizacionDuplicado = (e: unknown) => (e as { code?: string })?.code === 'P2002'
  && JSON.stringify((e as { meta?: unknown })?.meta ?? {}).includes('number')
