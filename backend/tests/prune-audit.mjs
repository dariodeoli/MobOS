// Poda de auditoría: por defecto cuenta lo que borraría; con --execute elimina
// los AuditLog más viejos que N días (default 365). Pensado para cron/ops.
// Uso: DATABASE_URL=... node tests/prune-audit.mjs [--days=365] [--execute]
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const arg = name => {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : undefined
}
const days = arg('days') ?? 365
const execute = process.argv.includes('--execute')
if (!Number.isSafeInteger(days) || days < 30) {
  console.error('--days debe ser un entero >= 30.')
  process.exit(2)
}
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Falta DATABASE_URL.')
  process.exit(2)
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
const cutoff = new Date(Date.now() - days * 86400000)

try {
  const where = { createdAt: { lt: cutoff } }
  const pending = await prisma.auditLog.count({ where })
  if (!execute) {
    console.log(`prune-audit: ${pending} registro(s) anteriores a ${cutoff.toISOString().slice(0, 10)} serían eliminados (sin --execute).`)
    process.exit(0)
  }
  const deleted = await prisma.auditLog.deleteMany({ where })
  console.log(`prune-audit: ${deleted.count} registro(s) eliminados (anteriores a ${cutoff.toISOString().slice(0, 10)}).`)
} finally {
  await prisma.$disconnect()
}
