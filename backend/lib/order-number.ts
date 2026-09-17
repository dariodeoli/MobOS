import type { Prisma } from '@prisma/client'

type ErrorPrisma = { code?: string; meta?: { target?: unknown } }

// Secuencia interna por empresa: MOB-0001, MOB-0002… (4 dígitos; al superar
// 9999 sigue con 5 o más). Toma el máximo de los códigos MOB-<n> del tenant y
// devuelve el siguiente. El advisory lock serializa la asignación dentro de la
// transacción para que dos ventas simultáneas no repitan número.
export async function nextOrderNumber(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order-number:${tenantId}`}, 0))`
  const rows = await tx.order.findMany({
    where: { tenantId, orderNumber: { startsWith: 'MOB-' } },
    select: { orderNumber: true },
  })
  const maximo = rows.reduce((mayor, row) => {
    const match = /^MOB-(\d+)$/.exec(row.orderNumber)
    return match ? Math.max(mayor, Number(match[1])) : mayor
  }, 0)
  return `MOB-${String(maximo + 1).padStart(4, '0')}`
}

// Colisión con la unique (tenantId, orderNumber): permite reintentar una vez.
export function esColisionDeNumero(error: unknown) {
  const cause = error as ErrorPrisma | null
  if (cause?.code !== 'P2002') return false
  const target = cause.meta?.target
  return Array.isArray(target) ? target.includes('orderNumber') : typeof target === 'string' && target.includes('orderNumber')
}
