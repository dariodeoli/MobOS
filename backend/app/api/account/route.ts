import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { googleStores } from '../../../lib/google-company'
import { formatOrderNumber, maxOrderSequence } from '../../../lib/order-number'

const REAUTH_WINDOW_MS = 10 * 60 * 1000
const ADMIN_ROLE = 'ADMIN'

function input(value: unknown, field: string, min = 1, max = 500) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`${field} inválido.`)
  return value.trim()
}

async function adminSession(request: Request) {
  const session = await requireSession(request)
  if (!session) return { error: error('Falta sesión.', 401) as Response }
  if (session.user.role !== ADMIN_ROLE) return { error: error('Solo el dueño puede administrar la cuenta.', 403) as Response }
  return { session }
}

async function assertRecentReauth(sessionId: string, tenantId: string) {
  const session = await prisma.session.findFirst({ where: { id: sessionId, tenantId, revokedAt: null }, select: { reauthenticatedAt: true } })
  if (!session?.reauthenticatedAt || Date.now() - session.reauthenticatedAt.getTime() > REAUTH_WINDOW_MS) throw new Error('Reautenticá tu contraseña para continuar.')
}

async function verifyCredential(tenantId: string, userId: string, password: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { passwordHash: true } })
  if (tenant?.passwordHash) return bcrypt.compare(password, tenant.passwordHash)
  // Las tiendas vinculadas a Google no tienen contraseña de empresa: el
  // dueño se reautentica con su PIN de administrador.
  const ownerUser = await prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true } })
  if (!ownerUser?.pinHash) return false
  return bcrypt.compare(password, ownerUser.pinHash)
}

export async function GET(request: Request) {
  const context = await adminSession(request)
  if ('error' in context) return context.error
  const { session } = context
  const now = new Date()
  const [tenant, sessions, ownerAccess] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id: true, name: true, email: true, slug: true, archivedAt: true, archivedReason: true, createdAt: true, orderPrefix: true, orderNextNumber: true, logos: { select: { variant: true, updatedAt: true, mimeType: true } } } }),
    prisma.session.findMany({ where: { tenantId: session.user.tenantId, revokedAt: null, expiresAt: { gt: now } }, orderBy: { lastSeenAt: 'desc' }, take: 50, select: { id: true, level: true, deviceId: true, branchId: true, createdAt: true, lastSeenAt: true, expiresAt: true, user: { select: { name: true, email: true, role: true } } } }),
    prisma.googleStoreAccess.findFirst({ where: { tenantId: session.user.tenantId, owner: true }, select: { subject: true } }),
  ])
  if (!tenant) return error('Empresa no encontrada.', 404)
  // Para el dueño Google: todas las tiendas de su persona, con la actual marcada.
  const stores = ownerAccess ? (await googleStores(ownerAccess.subject)).map(store => ({ ...store, current: store.id === session.user.tenantId })) : null
  // El contrato del frontend sigue siendo `tenant.logo` (la variante clara manda);
  // `logos` es el detalle por variante y no se expone suelto.
  const { logos, ...restoTenant } = tenant
  const logo = logos.find((item) => item.variant === 'light') ?? logos[0] ?? null
  return json({ tenant: { ...restoTenant, logo, logos }, currentSessionId: session.sessionId, reauthValidUntil: null, sessions, stores })
}

export async function POST(request: Request) {
  const context = await adminSession(request)
  if ('error' in context) return context.error
  try {
    const body = await request.json() as Record<string, unknown>
    const password = input(body.password, 'Contraseña', 1, 72)
    const tenant = await prisma.tenant.findUnique({ where: { id: context.session.user.tenantId }, select: { id: true } })
    if (!tenant || !(await verifyCredential(context.session.user.tenantId, context.session.user.id, password))) return error('No se pudo reautenticar la cuenta.', 401)
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.session.update({ where: { id: context.session.sessionId }, data: { reauthenticatedAt: now } })
      await tx.auditLog.create({ data: { tenantId: tenant.id, userId: context.session.user.id, action: 'ACCOUNT_REAUTHENTICATED', entity: 'Session', entityId: context.session.sessionId, metadata: {} } })
    })
    return json({ ok: true, validUntil: new Date(now.getTime() + REAUTH_WINDOW_MS) })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo reautenticar la cuenta.', 400) }
}

export async function PATCH(request: Request) {
  const context = await adminSession(request)
  if ('error' in context) return context.error
  try {
    const body = await request.json() as Record<string, unknown>
    const action = input(body.action, 'Acción', 1, 40)
    const { session } = context
    await assertRecentReauth(session.sessionId, session.user.tenantId)
    const now = new Date()
    if (action === 'revokeSession') {
      const targetId = input(body.sessionId, 'Sesión', 1, 200)
      const target = await prisma.session.findFirst({ where: { id: targetId, tenantId: session.user.tenantId, revokedAt: null }, select: { id: true, userId: true, level: true } })
      if (!target) return error('La sesión ya no está activa.', 404)
      await prisma.$transaction(async tx => {
        await tx.session.update({ where: { id: target.id }, data: { revokedAt: now } })
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ACCOUNT_SESSION_REVOKED', entity: 'Session', entityId: target.id, metadata: { level: target.level, ownSession: target.id === session.sessionId } } })
      })
      return json({ ok: true, revokedSessionId: target.id })
    }
    if (action === 'archive') {
      const reason = input(body.reason, 'Motivo de archivado', 10, 500)
      await prisma.$transaction(async tx => {
        await tx.tenant.update({ where: { id: session.user.tenantId }, data: { archivedAt: now, archivedReason: reason, lockedUntil: new Date('9999-12-31T23:59:59.999Z') } })
        await tx.session.updateMany({ where: { tenantId: session.user.tenantId, revokedAt: null }, data: { revokedAt: now } })
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_ARCHIVED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { reason } } })
      })
      return json({ ok: true, archivedAt: now })
    }
    if (action === 'orderNumbering') {
      const prefix = input(body.prefix, 'Prefijo', 2, 3).toUpperCase()
      if (!/^[A-Z]{2,3}$/.test(prefix)) return error('El prefijo debe tener 2 o 3 letras.', 400)
      const start = Number(body.start)
      if (!Number.isSafeInteger(start) || start < 1 || start > 99999999) return error('El número inicial debe ser un entero positivo.', 400)
      const orderNumber = formatOrderNumber(prefix, start)
      if (await prisma.order.findFirst({ where: { tenantId: session.user.tenantId, orderNumber }, select: { id: true } })) return error('Ya existe un pedido con ese número. Elegí otro inicial.', 409)
      // El contador nunca queda por debajo de lo ya usado con ese prefijo.
      const nextNumber = await prisma.$transaction(async tx => {
        const siguiente = Math.max(start, (await maxOrderSequence(tx, session.user.tenantId, prefix)) + 1)
        await tx.tenant.update({ where: { id: session.user.tenantId }, data: { orderPrefix: prefix, orderNextNumber: siguiente } })
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_ORDER_NUMBERING', entity: 'Tenant', entityId: session.user.tenantId, metadata: { prefix, start } } })
        return siguiente
      })
      return json({ ok: true, prefix, nextNumber, preview: orderNumber })
    }
    if (action === 'updateProfile') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const name = body.name === undefined ? undefined : input(body.name, 'Nombre de la tienda', 2, 120)
      const email = body.email === undefined ? undefined : input(body.email, 'Correo de la empresa', 3, 160)
      if (name === undefined && email === undefined) return error('Indicá el nombre o el correo a actualizar.', 400)
      if (email !== undefined && !emailPattern.test(email)) return error('El correo de la empresa no es válido.', 400)
      const current = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { name: true, email: true } })
      if (!current) return error('Empresa no encontrada.', 404)
      const nextName = name ?? current.name
      const nextEmail = email ? email.toLowerCase() : current.email
      if (nextEmail !== current.email && await prisma.tenant.findFirst({ where: { email: nextEmail, id: { not: session.user.tenantId } }, select: { id: true } })) return error('Ese correo ya lo usa otra empresa.', 409)
      await prisma.$transaction(async tx => {
        await tx.tenant.update({ where: { id: session.user.tenantId }, data: { name: nextName, email: nextEmail } })
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_PROFILE_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { before: { name: current.name, email: current.email }, after: { name: nextName, email: nextEmail } } } })
      })
      return json({ ok: true, name: nextName, email: nextEmail })
    }
    if (action === 'leaveStore') {
      if (body.confirm !== 'ABANDONAR') return error('Escribí ABANDONAR para confirmar que dejás la tienda.', 400)
      const otherAdmin = await prisma.user.findFirst({ where: { tenantId: session.user.tenantId, role: ADMIN_ROLE, status: 'ACTIVE', id: { not: session.user.id } }, select: { id: true } })
      if (!otherAdmin) return error('No podés salir de la tienda: tiene que quedar al menos otro administrador activo. Designá a otro administrador antes de salir.', 409)
      const [currentUser, ownerAccess, tenantEmail] = await Promise.all([
        prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true } }),
        prisma.googleStoreAccess.findFirst({ where: { tenantId: session.user.tenantId, owner: true }, select: { subject: true, tenantId: true } }),
        prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { email: true } }).then(row => row?.email ?? null),
      ])
      // Si la persona es la dueña Google de la tienda (la creó con Google o su
      // correo coincide con el del alta), su acceso a la tienda se retira.
      const googleOwnerMarker = ownerAccess ? await prisma.auditLog.findFirst({ where: { tenantId: session.user.tenantId, userId: session.user.id, action: 'GOOGLE_STORE_OWNER_CREATED' }, select: { id: true } }) : null
      const isGoogleOwner = !!ownerAccess && !!currentUser && (!!googleOwnerMarker || (!!currentUser.email && !!tenantEmail && currentUser.email === tenantEmail))
      let userDeleted = false
      try {
        await prisma.$transaction(async tx => {
          await tx.session.updateMany({ where: { userId: session.user.id, revokedAt: null }, data: { revokedAt: now } })
          await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'LEAVE_STORE', entity: 'User', entityId: session.user.id, metadata: { userDeleted: true, googleAccessRevoked: isGoogleOwner } } })
          await tx.user.delete({ where: { id: session.user.id } })
          userDeleted = true
        })
      } catch (cause: any) {
        // Ventas, cajas o compras con FK restrict impiden borrar el historial:
        // el usuario queda inactivo y sus sesiones revocadas.
        if (cause?.code !== 'P2003') throw cause
      }
      if (!userDeleted) {
        await prisma.$transaction(async tx => {
          await tx.session.updateMany({ where: { userId: session.user.id, revokedAt: null }, data: { revokedAt: now } })
          await tx.user.update({ where: { id: session.user.id }, data: { status: 'INACTIVE' } })
          await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'LEAVE_STORE', entity: 'User', entityId: session.user.id, metadata: { userDeleted: false, googleAccessRevoked: isGoogleOwner } } })
        })
      }
      if (isGoogleOwner && ownerAccess) await prisma.googleStoreAccess.delete({ where: { subject_tenantId: { subject: ownerAccess.subject, tenantId: ownerAccess.tenantId } } })
      return json({ ok: true })
    }
    if (action === 'archiveStore') {
      // Archivar por defecto: la historia se conserva y soporte puede restaurar.
      if (body.confirm !== 'ARCHIVAR') return error('Escribí ARCHIVAR para confirmar el archivado de la tienda.', 400)
      const password = input(body.password, 'Contraseña', 1, 72)
      const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id: true, archivedAt: true } })
      if (!tenant || !(await verifyCredential(session.user.tenantId, session.user.id, password))) return error('No se pudo reautenticar la cuenta.', 401)
      if (tenant.archivedAt) return json({ ok: true, yaArchivada: true })
      const [products, orders] = await Promise.all([
        prisma.product.count({ where: { tenantId: session.user.tenantId } }),
        prisma.order.count({ where: { tenantId: session.user.tenantId } }),
      ])
      await prisma.$transaction(async tx => {
        await tx.tenant.update({ where: { id: session.user.tenantId }, data: { archivedAt: new Date(), archivedReason: 'Archivada por el dueño desde la app' } })
        await tx.session.updateMany({ where: { tenantId: session.user.tenantId, revokedAt: null }, data: { revokedAt: new Date() } })
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_ARCHIVED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { products, orders } } })
      })
      return json({ ok: true })
    }
    if (action === 'purgeStore') {
      if (body.confirm !== 'ELIMINAR') return error('Escribí ELIMINAR para confirmar la eliminación de la tienda.', 400)
      const password = input(body.password, 'Contraseña', 1, 72)
      const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id: true } })
      if (!tenant || !(await verifyCredential(session.user.tenantId, session.user.id, password))) return error('No se pudo reautenticar la cuenta.', 401)
      const [products, orders, accesses] = await Promise.all([
        prisma.product.count({ where: { tenantId: session.user.tenantId } }),
        prisma.order.count({ where: { tenantId: session.user.tenantId } }),
        prisma.googleStoreAccess.findMany({ where: { tenantId: session.user.tenantId }, select: { subject: true } }),
      ])
      await prisma.$transaction(async tx => {
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'STORE_PURGED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { products, orders } } })
        await tx.tenant.delete({ where: { id: session.user.tenantId } })
      })
      // El cascade del tenant retira los accesos; las identidades que quedan
      // sin ninguna tienda se eliminan.
      for (const access of accesses) {
        const remaining = await prisma.googleStoreAccess.count({ where: { subject: access.subject } })
        if (remaining === 0) await prisma.googleIdentity.deleteMany({ where: { subject: access.subject } })
      }
      return json({ ok: true })
    }
    return error('Acción de cuenta no admitida.', 400)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la cuenta.', 400) }
}
