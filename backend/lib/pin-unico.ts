import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { coincideAlgunHash } from './pin'

// El PIN identifica al vendedor cuando varios comparten el correo de la
// empresa: no puede repetirse entre los usuarios activos del mismo tenant.
export async function pinEnUso(tenantId: string, pin: string, exceptUserId?: string): Promise<boolean> {
  const users = await prisma.user.findMany({ where: { tenantId, status: 'ACTIVE', ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { pinHash: true } })
  return coincideAlgunHash(pin, users.map(user => user.pinHash), bcrypt.compare)
}
