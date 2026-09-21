import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { ensureStoreBranch } from '../../../lib/store-branch'

const MAX_PAYLOAD_BYTES = 200 * 1024

// Ventas suspendidas: carrito en espera por sucursal. Cualquier persona con
// permiso de venta lo guarda y cualquiera de la sucursal puede retomarlo.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['pos:use', 'orders:manage', 'orders:own', 'orders:branch'])) return error('No autorizado.', 403)
  const requested = new URL(request.url).searchParams.get('branchId')
  let branchId = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
  if (!branchId && (session.user.role === 'ADMIN' || session.user.role === 'GERENTE')) branchId = await ensureStoreBranch(session)
  const rows = await prisma.suspendedSale.findMany({
    where: { tenantId: tenant, ...(branchId ? { branchId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, branchId: true, userId: true, customerId: true, label: true, createdAt: true, payload: true, customer: { select: { id: true, name: true, phone: true, email: true } }, user: { select: { id: true, name: true } } },
  })
  return json(rows)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['pos:use', 'orders:manage', 'orders:own', 'orders:branch'])) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const payload = body.payload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new InputError('El carrito a suspender es inválido.')
    const payloadJson = JSON.stringify(payload)
    if (payloadJson.length > MAX_PAYLOAD_BYTES) throw new InputError('El carrito es demasiado grande para suspenderlo.')
    let branchId = session.user.branchId || (session.user.role === 'ADMIN' && typeof body.branchId === 'string' ? body.branchId : null)
    if (!branchId) branchId = await ensureStoreBranch(session)
    if (!branchId) throw new InputError('No hay una sucursal activa para suspender la venta.', 409)
    const customerId = body.customerId === undefined || body.customerId === null || body.customerId === '' ? null : textInput(body.customerId, 'customerId', 200)
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })
      if (!customer) throw new InputError('Cliente no encontrado.', 404)
    }
    const label = body.label === undefined || body.label === null || body.label === '' ? null : textInput(body.label, 'Etiqueta', 120)
    const suspended = await prisma.suspendedSale.create({ data: { tenantId: tenant, branchId, userId: session.user.id, customerId, label, payload: JSON.parse(payloadJson) as Prisma.InputJsonValue } })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SALE_SUSPENDED', entity: 'SuspendedSale', entityId: suspended.id, metadata: { branchId, customerId, label } } })
    return json(suspended, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo suspender la venta.', 400)
  }
}

// Enlace público del borrador (#154): genera un token de 64 hex, devuelve el
// token (una sola vez) y guarda solo su sha256. Regenerar invalida el anterior;
// un GET sin regenerar no puede devolver el token viejo porque no se guarda.
export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['pos:use', 'orders:manage', 'orders:own', 'orders:branch'])) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'Venta suspendida', 200)
    const row = await prisma.suspendedSale.findFirst({ where: { id, tenantId: tenant }, select: { id: true, userId: true, branchId: true, publicTokenHash: true } })
    if (!row) return error('Venta suspendida no encontrada.', 404)
    const isManager = canAccessAny(session.user, ['orders:manage']) || ['ADMIN', 'GERENTE'].includes(session.user.role)
    if (row.userId !== session.user.id && !isManager) return error('Solo quien la suspendió o gerencia pueden compartirla.', 403)
    if (body.regenerate !== true && row.publicTokenHash) {
      return error('El enlace ya se generó y no se puede volver a mostrar. Regeneralo para obtener uno nuevo.', 409, { code: 'link_already_issued', regenerate: true })
    }
    const token = randomBytes(32).toString('hex')
    const publicTokenHash = createHash('sha256').update(token).digest('hex')
    await prisma.$transaction(async tx => {
      await tx.suspendedSale.update({ where: { id: row.id }, data: { publicTokenHash, publicTokenIssuedAt: new Date() } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SALE_PUBLIC_LINK', entity: 'SuspendedSale', entityId: row.id, metadata: { branchId: row.branchId, regenerated: Boolean(row.publicTokenHash) } } })
    })
    return json({ id: row.id, token })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo preparar el enlace.', 400)
  }
}

export async function DELETE(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['pos:use', 'orders:manage', 'orders:own', 'orders:branch'])) return error('No autorizado.', 403)
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return error('Venta suspendida obligatoria.')
  const suspended = await prisma.suspendedSale.findFirst({ where: { id, tenantId: tenant } })
  if (!suspended) return error('Venta suspendida no encontrada.', 404)
  // Retomarla la borra; solo quien la guardó o gerencia pueden descartarla en
  // frío (recuperar no la borra hasta que el POS la levanta).
  const isManager = canAccessAny(session.user, ['orders:manage']) || ['ADMIN', 'GERENTE'].includes(session.user.role)
  if (suspended.userId !== session.user.id && !isManager) return error('Solo quien la suspendió o gerencia pueden descartarla.', 403)
  await prisma.suspendedSale.delete({ where: { id: suspended.id } })
  await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SALE_SUSPENDED_DISCARDED', entity: 'SuspendedSale', entityId: suspended.id, metadata: { branchId: suspended.branchId, ownerId: suspended.userId } } })
  return json({ id: suspended.id, discarded: true })
}
