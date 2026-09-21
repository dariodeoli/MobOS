import { randomUUID } from 'node:crypto'
import { hashTokenPublico, nuevoTokenPublico } from '../../../lib/public-token'
import { prisma } from '../../../lib/prisma'
import { resolveCustomerId } from '../../../lib/customer-link'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'
import { notifyWarrantyStatusChanged } from '../../../lib/email-notifications'

const STATUSES = ['RECEIVED', 'DIAGNOSIS', 'READY', 'DELIVERED'] as const
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  RECEIVED: 'Recibido',
  DIAGNOSIS: 'En diagnóstico',
  READY: 'Listo para retirar',
  DELIVERED: 'Entregado',
}
const rank = (status: string) => STATUSES.indexOf(status as (typeof STATUSES)[number])
const canManage = (user: { permissions: string[] }) => canAccessAny(user, ['warranties:manage'])
const withinLimit = (value: unknown) => typeof value === 'string' && value.trim().length <= 2000
const validDate = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && Number.isFinite(new Date(value).getTime()))
const list = (value: unknown, name: string) => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 20 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) throw new Error(`${name} debe ser una lista de hasta 20 textos.`)
  return value.map(item => item.trim())
}
const optionalText = (value: unknown, name: string, limit = 2000) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > limit) throw new Error(`${name} debe ser texto de hasta ${limit} caracteres.`)
  return value.trim() || null
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (session.user.role === 'VENDEDOR') return error('No autorizado.', 403)
  const q = new URL(request.url).searchParams.get('q')?.trim() || ''
  const kind = new URL(request.url).searchParams.get('kind')?.toUpperCase() === 'COVERAGE' ? 'COVERAGE' : 'SERVICE'
  const branch = session.user.role === 'ADMIN' ? null : session.user.branchId
  if (session.user.role !== 'ADMIN' && !branch) return json([])
  // El teléfono del cliente sale del pedido de origen (si existe) para que
  // Servicio Técnico pueda avisarle por WhatsApp sin volver a tipearlo.
  const rows = branch ? await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT w."id", w."tenantId", w."branchId", w."orderItemId", w."kind", w."customerName", w."serial", w."description", w."status", w."responsibleName", w."createdAt", w."updatedAt", w."expiresAt", w."warrantyDays", w."coverage", w."exclusions", w."publicToken", (w."publicTokenHash" IS NOT NULL) AS "hasPublicLink",
           c."phone" AS "customerPhone", c."countryCode" AS "customerCountryCode"
    FROM "WarrantyCase" w
    LEFT JOIN "OrderItem" oi ON oi."id" = w."orderItemId"
    LEFT JOIN "Order" o ON o."id" = oi."orderId"
    LEFT JOIN "Customer" c ON c."id" = o."customerId"
    WHERE w."tenantId" = ${tenant} AND w."branchId" = ${branch} AND w."kind" = ${kind}
      AND (${q} = '' OR w."serial" ILIKE ${`%${q}%`} OR w."customerName" ILIKE ${`%${q}%`} OR w."description" ILIKE ${`%${q}%`})
    ORDER BY w."createdAt" DESC LIMIT 100` : await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT w."id", w."tenantId", w."branchId", w."orderItemId", w."kind", w."customerName", w."serial", w."description", w."status", w."responsibleName", w."createdAt", w."updatedAt", w."expiresAt", w."warrantyDays", w."coverage", w."exclusions", w."publicToken", (w."publicTokenHash" IS NOT NULL) AS "hasPublicLink",
           c."phone" AS "customerPhone", c."countryCode" AS "customerCountryCode"
    FROM "WarrantyCase" w
    LEFT JOIN "OrderItem" oi ON oi."id" = w."orderItemId"
    LEFT JOIN "Order" o ON o."id" = oi."orderId"
    LEFT JOIN "Customer" c ON c."id" = o."customerId"
    WHERE w."tenantId" = ${tenant} AND w."kind" = ${kind}
      AND (${q} = '' OR w."serial" ILIKE ${`%${q}%`} OR w."customerName" ILIKE ${`%${q}%`} OR w."description" ILIKE ${`%${q}%`})
    ORDER BY w."createdAt" DESC LIMIT 100`
  return json(rows)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canManage(session.user)) return error('No autorizado.', 403)
  const body = await request.json()
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : ''
  // La ficha se resuelve por id o, si no vino, por nombre exacto e inequívoco:
  // así la garantía queda ligada al cliente y aparece en su perfil aunque el
  // nombre se escriba con otra tilde después.
  const customerId = await resolveCustomerId(prisma, tenant, body.customerId, customerName)
  const serial = typeof body.serial === 'string' ? body.serial.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const branchId = typeof body.branchId === 'string' ? body.branchId : session.user.branchId
  if (!customerName || !serial || !description || !branchId) return error('Cliente, serial, descripción y sucursal son obligatorios.')
  if (![customerName, serial, description].every(withinLimit) || (body.responsibleName !== undefined && !withinLimit(body.responsibleName))) return error('Los textos no pueden superar 2000 caracteres.')
  if (!validDate(body.expiresAt)) return error('La fecha de vencimiento no es válida.')
  if (session.user.role === 'GERENTE' && branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  try {
    let tokenPublico = ''
    const row = await prisma.$transaction(async (tx) => {
      const branch = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Branch" WHERE "id" = ${branchId} AND "tenantId" = ${tenant} AND "isActive" = true`
      if (!branch.length) throw new Error('Sucursal no encontrada.')
      if (body.orderItemId) {
        const item = await tx.$queryRaw<Array<{ id: string }>>`SELECT oi."id" FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId" WHERE oi."id" = ${body.orderItemId} AND o."tenantId" = ${tenant} AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)`
        if (!item.length) throw new Error('Ítem de venta fuera del tenant o sucursal.')
      }
      const id = randomUUID()
      const diagnosis = optionalText(body.diagnosis, 'diagnosis'); const technicianName = optionalText(body.technicianName, 'technicianName', 200); const photos = list(body.photos, 'photos'); const parts = list(body.parts, 'parts')
      const coverage = optionalText(body.coverage, 'coverage'); const exclusions = optionalText(body.exclusions, 'exclusions')
      const warrantyDays = body.warrantyDays === undefined || body.warrantyDays === '' || body.warrantyDays === null ? undefined : Number(body.warrantyDays)
      if (warrantyDays !== undefined && (!Number.isSafeInteger(warrantyDays) || warrantyDays < 1 || warrantyDays > 730)) throw new Error('Los días de garantía deben estar entre 1 y 730.')
      const publicToken = nuevoTokenPublico()
      tokenPublico = publicToken
      // Sin vencimiento explícito, se deriva de los días de garantía: desde la
      // compra si la garantía cuelga de una línea de pedido, o desde hoy.
      let expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
      if (!expiresAt && warrantyDays) {
        const purchase = body.orderItemId
          ? await tx.$queryRaw<Array<{ createdAt: Date }>>`SELECT o."createdAt" FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o."id" WHERE oi."id" = ${body.orderItemId} LIMIT 1`
          : []
        const base = purchase[0]?.createdAt ? new Date(purchase[0].createdAt) : new Date()
        expiresAt = new Date(base.getTime() + warrantyDays * 86400000)
      }
      await tx.warrantyCase.create({ data: { id, tenantId: tenant, branchId, orderItemId: body.orderItemId || null, ...(customerId ? { customerId } : {}), customerName, serial, description, responsibleName: typeof body.responsibleName === 'string' ? body.responsibleName.trim() : null, expiresAt, publicToken, publicTokenHash: hashTokenPublico(publicToken), warrantyDays: warrantyDays ?? null, coverage: coverage ?? null, exclusions: exclusions ?? null, diagnosis: diagnosis ?? null, technicianName: technicianName ?? null, ...(photos ? { photos } : {}), ...(parts ? { parts } : {}) } })
      await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${tenant}, ${session.user.id}, 'WARRANTY_CREATED', 'WarrantyCase', ${id}, ${JSON.stringify({ serial, branchId, ...(customerId ? { customerId } : {}) })}::jsonb)`
      return tx.$queryRaw`SELECT * FROM "WarrantyCase" WHERE "id" = ${id}`
    })
    // El token en claro se muestra una sola vez (para copiar el enlace o
    // imprimir el QR) y su sha256 queda guardado para la búsqueda pública
    // (#172/#178). Mientras otras superficies (página pública del pedido) lean
    // `publicToken`, la rotación explícita es la que lo borra.
    return json({ ...(Array.isArray(row) ? row[0] : row), publicToken: tokenPublico }, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear la garantía.', 409) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canManage(session.user)) return error('No autorizado.', 403)
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
      const diagnosis = optionalText(body.diagnosis, 'diagnosis'); const technicianName = optionalText(body.technicianName, 'technicianName', 200); const resolution = optionalText(body.resolution, 'resolution'); const photos = list(body.photos, 'photos'); const parts = list(body.parts, 'parts'); const repairCostPyg = body.repairCostPyg === undefined ? undefined : Number(body.repairCostPyg)
      if (repairCostPyg !== undefined && (!Number.isSafeInteger(repairCostPyg) || repairCostPyg < 0 || repairCostPyg > 2147483647)) throw new Error('Costo de reparación inválido.')
      const coverage = optionalText(body.coverage, 'coverage'); const exclusions = optionalText(body.exclusions, 'exclusions')
      const warrantyDays = body.warrantyDays === undefined || body.warrantyDays === '' || body.warrantyDays === null ? undefined : Number(body.warrantyDays)
      if (warrantyDays !== undefined && (!Number.isSafeInteger(warrantyDays) || warrantyDays < 1 || warrantyDays > 730)) throw new Error('Los días de garantía deben estar entre 1 y 730.')
      const expiresAt = body.expiresAt === undefined ? undefined : validDate(body.expiresAt) ? (body.expiresAt === null || body.expiresAt === '' ? null : new Date(body.expiresAt)) : undefined
      if (expiresAt === undefined && body.expiresAt !== undefined) throw new Error('La fecha de vencimiento no es válida.')
      // Rotación del enlace público (#172/#178): el token en claro anterior se
      // borra y el nuevo se muestra una sola vez en la respuesta.
      const regenerar = body.regeneratePublicToken === true
      const tokenNuevo = regenerar ? nuevoTokenPublico() : null
      const updated = await tx.warrantyCase.update({ where: { id: body.id }, data: { status: next, ...(typeof body.responsibleName === 'string' ? { responsibleName: body.responsibleName.trim() || null } : {}), ...(typeof body.description === 'string' ? { description: body.description.trim() } : {}), ...(diagnosis !== undefined ? { diagnosis } : {}), ...(technicianName !== undefined ? { technicianName } : {}), ...(resolution !== undefined ? { resolution } : {}), ...(photos !== undefined ? { photos } : {}), ...(parts !== undefined ? { parts } : {}), ...(repairCostPyg !== undefined ? { repairCostPyg } : {}), ...(coverage !== undefined ? { coverage } : {}), ...(exclusions !== undefined ? { exclusions } : {}), ...(warrantyDays !== undefined ? { warrantyDays } : {}), ...(expiresAt !== undefined ? { expiresAt } : {}), ...(regenerar && tokenNuevo ? { publicToken: null, publicTokenHash: hashTokenPublico(tokenNuevo) } : {}) } })
      await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${tenant}, ${session.user.id}, 'WARRANTY_UPDATED', 'WarrantyCase', ${body.id}, ${JSON.stringify({ from: current[0].status, to: next, ...(regenerar ? { publicTokenRegenerated: true } : {}) })}::jsonb)`
      await notifyWarrantyStatusChanged(tx, { tenantId: tenant, caseId: body.id, customerName: String(updated.customerName ?? ''), serial: String(updated.serial ?? ''), statusLabel: STATUS_LABELS[next as (typeof STATUSES)[number]], publicToken: updated.publicToken ?? null })
      return { ...updated, ...(regenerar && tokenNuevo ? { publicToken: tokenNuevo } : {}) }
    })
    return json(Array.isArray(result) ? result[0] : result)
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo actualizar la garantía.', 409) }
}
