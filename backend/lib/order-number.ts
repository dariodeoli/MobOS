import type { Prisma } from '@prisma/client'

// Código comercial corto y legible para humanos (MOB-#0001). El id interno
// (UUID) sigue siendo el que relaciona pedidos, pagos y accesos públicos.
const PREFIX_PATTERN = /^[A-Z]{2,3}$/
const DEFAULT_PREFIX = 'MOB'
const ORDER_NUMBER_MAX = 99999999

// El prefijo configurado por la empresa manda; si falta o no es válido (2–3
// letras) se usa MOB.
export const normalizeOrderPrefix = (value: string | null | undefined) => {
  const prefix = String(value ?? '').trim().toUpperCase()
  return PREFIX_PATTERN.test(prefix) ? prefix : DEFAULT_PREFIX
}

// Formato guardado `PREFIX-#0001`: mínimo 4 dígitos y crece sin romper.
export const formatOrderNumber = (prefix: string, sequence: number) => `${prefix}-#${String(sequence).padStart(4, '0')}`

// Máximo histórico del tenant para ese prefijo. Se compara como número, no como
// texto: al pasar los 4 dígitos (MOB-#10000) el orden alfabético dejaría de
// coincidir con el secuencial.
export async function maxOrderSequence(tx: Prisma.TransactionClient, tenant: string, prefix: string) {
  const [ultimo] = await tx.$queryRaw<Array<{ max: bigint | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("orderNumber" FROM length(${prefix}) + 3) AS BIGINT)), 0) AS max
    FROM "Order"
    WHERE "tenantId" = ${tenant} AND "orderNumber" ~ ('^' || ${prefix} || '-#[0-9]+$')
  `
  return Number(ultimo?.max ?? 0n)
}

// Numeración transaccional por empresa: bloquea el contador del tenant, salta
// por encima de lo ya usado (por si el contador quedó atrás) y recién ahí lo
// avanza. Se llama dentro de la transacción que crea el pedido.
export async function nextOrderNumber(tx: Prisma.TransactionClient, tenant: string) {
  const [config] = await tx.$queryRaw<Array<{ orderPrefix: string | null; orderNextNumber: number | null }>>`
    SELECT "orderPrefix", "orderNextNumber" FROM "Tenant" WHERE id = ${tenant} FOR UPDATE
  `
  const prefijo = normalizeOrderPrefix(config?.orderPrefix)
  const secuencia = Math.max(Number(config?.orderNextNumber ?? 1), (await maxOrderSequence(tx, tenant, prefijo)) + 1, 1)
  if (!Number.isSafeInteger(secuencia) || secuencia > ORDER_NUMBER_MAX) throw new Error('Se agotó la numeración de pedidos.')
  await tx.$queryRaw`UPDATE "Tenant" SET "orderNextNumber" = ${secuencia + 1} WHERE id = ${tenant}`
  return formatOrderNumber(prefijo, secuencia)
}

// Dos ventas simultáneas pueden calcular el mismo número; el índice único
// rechaza la segunda y el POST se reintenta con el siguiente.
export const esCodigoDuplicado = (e: unknown) => (e as { code?: string })?.code === 'P2002'
  && JSON.stringify((e as { meta?: unknown })?.meta ?? {}).includes('orderNumber')
