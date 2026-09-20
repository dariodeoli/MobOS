import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { ensureStoreBranch } from '../../../lib/store-branch'

const MAX_PAYLOAD_BYTES = 200 * 1024
// Límite y vigencia: un carrito en espera no vive para siempre. Al pasar el
// tope la sucursal tiene que recuperar o descartar; los vencidos se limpian
// solos (con auditoría) al listar o al intentar suspender otro.
const MAX_POR_SUCURSAL = 50
const VIGENCIA_DIAS = 7

// Nombre del cliente del carrito guardado: el POS permite escribir un cliente
// sin ficha creada, así que el payload es la fuente cuando no hay relación.
function payloadCustomerName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const customer = (payload as { customer?: unknown }).customer
  if (!customer || typeof customer !== 'object') return null
  const name = (customer as { name?: unknown }).name
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : null
}

// Total del carrito guardado: líneas menos el descuento global, acotado al
// rango de la columna. Solo para identificar la venta en el listado.
function payloadTotalPyg(payload: unknown): number {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0
  const carrito = payload as { items?: unknown; descuento?: unknown }
  const items = Array.isArray(carrito.items) ? carrito.items : []
  let subtotal = 0
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const precio = Number((item as { precio?: unknown }).precio)
    const cantidad = Number((item as { quantity?: unknown }).quantity)
    if (!Number.isFinite(precio) || precio < 0 || !Number.isInteger(cantidad) || cantidad <= 0) continue
    subtotal += precio * cantidad
    if (subtotal > 2147483647) return 2147483647
  }
  const descuento = Number(carrito.descuento)
  const total = Number.isFinite(descuento) && descuento > 0 ? Math.round(subtotal - descuento) : Math.round(subtotal)
  return Math.max(0, Math.min(2147483647, total))
}

// Borra las suspendidas vencidas de la sucursal (o de toda la empresa si no se
// pasa sucursal) y deja el rastro en auditoría.
async function purgeExpired(tenant: string, branchId: string | null) {
  const cutoff = new Date(Date.now() - VIGENCIA_DIAS * 24 * 60 * 60 * 1000)
  const where = { tenantId: tenant, ...(branchId ? { branchId } : {}), createdAt: { lt: cutoff } }
  const vencidas = await prisma.suspendedSale.findMany({ where, select: { id: true, branchId: true, userId: true } })
  if (!vencidas.length) return
  await prisma.$transaction([
    prisma.suspendedSale.deleteMany({ where: { id: { in: vencidas.map((row) => row.id) } } }),
    prisma.auditLog.createMany({
      data: vencidas.map((row) => ({
        tenantId: tenant,
        userId: row.userId,
        action: 'SALE_SUSPENDED_EXPIRED',
        entity: 'SuspendedSale',
        entityId: row.id,
        metadata: { branchId: row.branchId, dias: VIGENCIA_DIAS },
      })),
    }),
  ])
}

// Ventas suspendidas: carrito en espera por sucursal. Cualquier persona con
// permiso de venta lo guarda y cualquiera de la sucursal puede retomarlo.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['pos:use', 'orders:manage', 'orders:own', 'orders:branch'])) return error('No autorizado.', 403)
  const requested = new URL(request.url).searchParams.get('branchId')
  let branchId = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
  if (!branchId && (session.user.role === 'ADMIN' || session.user.role === 'GERENTE')) branchId = await ensureStoreBranch(session)
  await purgeExpired(tenant, branchId)
  const rows = await prisma.suspendedSale.findMany({
    where: { tenantId: tenant, ...(branchId ? { branchId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: MAX_POR_SUCURSAL,
    select: { id: true, branchId: true, userId: true, customerId: true, label: true, createdAt: true, payload: true, customer: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
  })
  // `totalPyg` y `customerName` viajan calculados desde el payload guardado: la
  // lista los muestra sin obligar a la UI a interpretar el carrito, y el
  // cliente escrito sin ficha igual queda identificado.
  return json(rows.map((row) => ({
    ...row,
    totalPyg: payloadTotalPyg(row.payload),
    customerName: row.customer?.name || payloadCustomerName(row.payload),
  })))
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
    await purgeExpired(tenant, branchId)
    const enEspera = await prisma.suspendedSale.count({ where: { tenantId: tenant, branchId } })
    if (enEspera >= MAX_POR_SUCURSAL) {
      throw new InputError(`Esta sucursal ya tiene ${MAX_POR_SUCURSAL} ventas suspendidas. Recuperá o descartá alguna antes de suspender otra.`, 409)
    }
    const customerId = body.customerId === undefined || body.customerId === null || body.customerId === '' ? null : textInput(body.customerId, 'customerId', 200)
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })
      if (!customer) throw new InputError('Cliente no encontrado.', 404)
    }
    const label = body.label === undefined || body.label === null || body.label === '' ? null : textInput(body.label, 'Etiqueta', 120)
    const suspended = await prisma.suspendedSale.create({ data: { tenantId: tenant, branchId, userId: session.user.id, customerId, label, payload: JSON.parse(payloadJson) as Prisma.InputJsonValue } })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SALE_SUSPENDED', entity: 'SuspendedSale', entityId: suspended.id, metadata: { branchId, customerId, label, totalPyg: payloadTotalPyg(payload) } } })
    return json(suspended, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo suspender la venta.', 400)
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
