import { randomUUID } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'

const STATUSES = ['RECEIVED', 'DIAGNOSIS', 'READY', 'DELIVERED'] as const
const rank = (status: string) => STATUSES.indexOf(status as (typeof STATUSES)[number])
const canManage = (role: string) => role === 'ADMIN' || role === 'GERENTE'
const withinLimit = (value: unknown) => typeof value === 'string' && value.trim().length <= 2000
const validDate = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && Number.isFinite(new Date(value).getTime()))

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (session.user.role === 'VENDEDOR') return error('No autorizado.', 403)
  const q = new URL(request.url).searchParams.get('q')?.trim() || ''
  const branch = session.user.role === 'ADMIN' ? null : session.user.branchId
  if (session.user.role !== 'ADMIN' && !branch) return json([])
  const rows = branch ? await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id", "tenantId", "branchId", "orderItemId", "customerName", "serial", "description", "status", "responsibleName", "createdAt", "updatedAt", "expiresAt"
    FROM "WarrantyCase"
    WHERE "tenantId" = ${tenant} AND "branchId" = ${branch}
      AND (${q} = '' OR "serial" ILIKE ${`%${q}%`} OR "customerName" ILIKE ${`%${q}%`} OR "description" ILIKE ${`%${q}%`})
    ORDER BY "createdAt" DESC LIMIT 100` : await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id", "tenantId", "branchId", "orderItemId", "customerName", "serial", "description", "status", "responsibleName", "createdAt", "updatedAt", "expiresAt"
    FROM "WarrantyCase"
    WHERE "tenantId" = ${tenant}
      AND (${q} = '' OR "serial" ILIKE ${`%${q}%`} OR "customerName" ILIKE ${`%${q}%`} OR "description" ILIKE ${`%${q}%`})
    ORDER BY "createdAt" DESC LIMIT 100`
  return json(rows)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canManage(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json()
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : ''
  const serial = typeof body.serial === 'string' ? body.serial.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const branchId = typeof body.branchId === 'string' ? body.branchId : session.user.branchId
  if (!customerName || !serial || !description || !branchId) return error('Cliente, serial, descripción y sucursal son obligatorios.')
  if (![customerName, serial, description].every(withinLimit) || (body.responsibleName !== undefined && !withinLimit(body.responsibleName))) return error('Los textos no pueden superar 2000 caracteres.')
  if (!validDate(body.expiresAt)) return error('La fecha de vencimiento no es válida.')
  if (session.user.role === 'GERENTE' && branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  try {
    const row = await prisma.$transaction(async (tx) => {
      const branch = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Branch" WHERE "id" = ${branchId} AND "tenantId" = ${tenant} AND "isActive" = true`
      if (!branch.length) throw new Error('Sucursal no encontrada.')
      if (body.orderItemId) {
        const item = await tx.$queryRaw<Array<{ id: string }>>`SELECT oi."id" FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId" WHERE oi."id" = ${body.orderItemId} AND o."tenantId" = ${tenant} AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)`
        if (!item.length) throw new Error('Ítem de venta fuera del tenant o sucursal.')
      }
      const id = randomUUID()
      await tx.$executeRaw`INSERT INTO "WarrantyCase" ("id", "tenantId", "branchId", "orderItemId", "customerName", "serial", "description", "responsibleName", "expiresAt") VALUES (${id}, ${tenant}, ${branchId}, ${body.orderItemId || null}, ${customerName}, ${serial}, ${description}, ${typeof body.responsibleName === 'string' ? body.responsibleName.trim() : null}, ${body.expiresAt ? new Date(body.expiresAt) : null})`
      await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${tenant}, ${session.user.id}, 'WARRANTY_CREATED', 'WarrantyCase', ${id}, ${JSON.stringify({ serial, branchId })}::jsonb)`
      return tx.$queryRaw`SELECT * FROM "WarrantyCase" WHERE "id" = ${id}`
    })
    return json(Array.isArray(row) ? row[0] : row, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear la garantía.', 409) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canManage(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); if (!body.id) return error('El caso es obligatorio.')
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = session.user.role === 'ADMIN'
        ? await tx.$queryRaw<Array<{ status: string; branchId: string }>>`SELECT "status", "branchId" FROM "WarrantyCase" WHERE "id" = ${body.id} AND "tenantId" = ${tenant} FOR UPDATE`
        : await tx.$queryRaw<Array<{ status: string; branchId: string }>>`SELECT "status", "branchId" FROM "WarrantyCase" WHERE "id" = ${body.id} AND "tenantId" = ${tenant} AND "branchId" = ${session.user.branchId} FOR UPDATE`
      if (!current.length) throw new Error('Caso no encontrado.')
      const next = body.status || current[0].status
      if (!STATUSES.includes(next) || rank(next) < rank(current[0].status) || rank(next) > rank(current[0].status) + 1) throw new Error('Transición de garantía no permitida.')
      if (body.description !== undefined && !withinLimit(body.description)) throw new Error('La descripción no puede superar 2000 caracteres.')
      if (body.responsibleName !== undefined && !withinLimit(body.responsibleName)) throw new Error('El responsable no puede superar 2000 caracteres.')
      await tx.$executeRaw`UPDATE "WarrantyCase" SET "status" = ${next}::"WarrantyStatus", "responsibleName" = COALESCE(${typeof body.responsibleName === 'string' ? body.responsibleName.trim() : null}, "responsibleName"), "description" = COALESCE(${typeof body.description === 'string' ? body.description.trim() : null}, "description"), "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${body.id} AND "tenantId" = ${tenant}`
      await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${tenant}, ${session.user.id}, 'WARRANTY_UPDATED', 'WarrantyCase', ${body.id}, ${JSON.stringify({ from: current[0].status, to: next })}::jsonb)`
      return tx.$queryRaw`SELECT * FROM "WarrantyCase" WHERE "id" = ${body.id} AND "tenantId" = ${tenant}`
    })
    return json(Array.isArray(result) ? result[0] : result)
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo actualizar la garantía.', 409) }
}
