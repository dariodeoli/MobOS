import { createHash } from 'node:crypto'
import { prisma } from './prisma'

export async function cargarCarritoPublico(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return { ok: false, status: 404, message: 'Carrito no encontrado.' } as const
  const publicTokenHash = createHash('sha256').update(token).digest('hex')
  const [estado] = await prisma.$queryRaw<Array<{ expira: Date | null; vencido: boolean }>>`
    SELECT "publicTokenExpiresAt" AS "expira", ("publicTokenExpiresAt" IS NOT NULL AND "publicTokenExpiresAt" <= now()) AS "vencido"
    FROM "SuspendedSale" WHERE "publicTokenHash" = ${publicTokenHash}
  `
  if (!estado) return { ok: false, status: 404, message: 'Carrito no encontrado.' } as const
  if (estado.vencido) return { ok: false, status: 410, message: 'Este enlace venció. Pedí uno nuevo a la tienda.' } as const
  const row = await prisma.suspendedSale.findFirst({ where: { publicTokenHash }, include: { tenant: { select: { name: true, city: true } }, branch: { select: { name: true, city: true, phone: true, tenantId: true } }, customer: { select: { name: true } } } })
  if (!row) return { ok: false, status: 404, message: 'Carrito no encontrado.' } as const
  return { ok: true, row, expiresAt: estado.expira } as const
}
