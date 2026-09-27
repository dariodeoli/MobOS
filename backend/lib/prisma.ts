import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Montos BIGINT (#148 §9): las respuestas JSON de la API serializan los
// importes como número (seguro hasta 2^53; el tope de producto es 99B). Fuera
// del rango seguro se conserva el string para no perder precisión.
declare global {
  interface BigInt { toJSON(): number | string }
}
BigInt.prototype.toJSON = function (this: bigint) {
  return this >= BigInt(Number.MIN_SAFE_INTEGER) && this <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(this) : this.toString()
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/mobos'
const adapter = new PrismaPg({ connectionString })
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
