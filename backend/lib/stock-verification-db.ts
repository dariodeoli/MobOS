import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { EXPECTED_STATUSES, summarizeVerification } from './stock-verification'

type Verification = { id: string; tenantId: string; branchId: string; locationId: string | null }

const UNIT_SELECT = { id: true, serial: true, status: true, locationId: true, product: { select: { name: true } }, location: { select: { name: true } } } as const

/** Series esperadas de la sesión: disponibles/reservadas/defectuosas de la sucursal (y depósito) sin baja. */
export async function expectedUnits(db: Prisma.TransactionClient | typeof prisma, v: Pick<Verification, 'tenantId' | 'branchId' | 'locationId'>) {
  return db.inventoryUnit.findMany({
    where: { tenantId: v.tenantId, branchId: v.branchId, ...(v.locationId ? { locationId: v.locationId } : {}), status: { in: [...EXPECTED_STATUSES] }, removedAt: null },
    orderBy: { serial: 'asc' },
    take: 5000,
    select: UNIT_SELECT,
  })
}

/** Detalle vivo de una sesión: resumen, pendientes, inesperadas y quién la hizo. */
export async function verificationDetail(tenantId: string, id: string) {
  const v = await prisma.stockVerification.findFirst({ where: { id, tenantId } })
  if (!v) return null
  const scans = await prisma.stockVerificationScan.findMany({ where: { verificationId: v.id }, orderBy: { createdAt: 'desc' }, take: 5000 })
  const [branch, location] = await Promise.all([
    prisma.branch.findFirst({ where: { id: v.branchId, tenantId }, select: { id: true, name: true } }),
    v.locationId ? prisma.stockLocation.findFirst({ where: { id: v.locationId, tenantId }, select: { id: true, name: true } }) : null,
  ])
  const userIds = [...new Set([v.startedById, v.finishedById, ...scans.map(scan => scan.scannedById)].filter(Boolean) as string[])]
  const users = await prisma.user.findMany({ where: { id: { in: userIds }, tenantId }, select: { id: true, name: true } })
  const byId = new Map(users.map(user => [user.id, user]))
  const person = (userId: string | null) => (userId ? byId.get(userId) ?? { id: userId, name: 'Usuario' } : null)

  let units = await expectedUnits(prisma, v)
  let pendingSerials: string[]
  let summary: { expected: number; verified: number; missing: number; unexpected: number; percent: number }
  if (v.status === 'OPEN') {
    const live = summarizeVerification(units.map(unit => unit.serial), scans)
    pendingSerials = live.pending
    summary = live
  } else {
    pendingSerials = Array.isArray(v.missingSerials) ? (v.missingSerials as string[]) : []
    summary = { expected: v.expectedCount, verified: v.verifiedCount, missing: v.missingCount, unexpected: v.unexpectedCount, percent: v.expectedCount ? Math.round((v.verifiedCount / v.expectedCount) * 100) : 100 }
    units = pendingSerials.length ? await prisma.inventoryUnit.findMany({ where: { tenantId, serial: { in: pendingSerials } }, select: UNIT_SELECT }) : []
  }
  const porSerial = new Map(units.map(unit => [unit.serial, unit]))
  const pending = pendingSerials.map(serial => { const unit = porSerial.get(serial); return { serial, productName: unit?.product?.name ?? null, locationName: unit?.location?.name ?? null } })
  const withPerson = (scan: (typeof scans)[number]) => ({ ...scan, scannedBy: person(scan.scannedById) })
  return {
    id: v.id, status: v.status, note: v.note, branch, location,
    startedAt: v.startedAt, startedBy: person(v.startedById), finishedAt: v.finishedAt, finishedBy: person(v.finishedById),
    summary: { expected: summary.expected, verified: summary.verified, missing: summary.missing, unexpected: summary.unexpected, percent: summary.percent },
    pending,
    verified: scans.filter(scan => scan.outcome === 'VERIFIED').map(withPerson),
    unexpected: scans.filter(scan => scan.outcome === 'UNEXPECTED').map(withPerson),
  }
}
