import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, hasPermission, requireSession } from '../../../../lib/auth'
import { serialKey } from '../../../../lib/validation'
import { moduloGuard } from '../../../../lib/modulos-guard'
import { sucursalEfectiva } from '../../../../lib/sucursal-efectiva'
import { HoldError, holdUnits, releaseHolds, renewHolds, serverNow, HOLD_SECONDS, HOLD_MAX_MINUTES, HOLD_MAX_PER_SELLER } from '../../../../lib/cart-holds'

/**
 * Retención de IMEI del carrito del POS (apartado corto con latido).
 *   POST   { cartId, deviceId?, serials[], branchId? }  crear/renovar (idempotente) → 201 | 409 | 422
 *   PATCH  { action:'renew', cartId, serials? }          latido (extiende hasta el tope de 60 min)
 *   PATCH  { action:'release', cartId?, serials? }        liberar (idempotente; las ajenas solo con stock:manage)
 *   POST   { action:'release', ... }                      igual que el PATCH (lo usa navigator.sendBeacon al cerrar la pestaña)
 * Toda respuesta trae `serverNow` (reloj de Postgres) para calcular el contador sin el reloj del celular.
 */
const SELLER_ROLES = ['VENDEDOR', 'CAJERA']
const POS_PERMISSIONS = ['pos:use', 'orders:manage', 'orders:own', 'orders:branch']
const id = (value: unknown, max = 128) => typeof value === 'string' && /^[\w:.-]{8,128}$/.test(value.trim()) ? value.trim().slice(0, max) : ''

async function leerCuerpo(request: Request) {
  // sendBeacon manda text/plain: se parsea el texto crudo en vez de request.json().
  try { const raw = await request.text(); return raw ? JSON.parse(raw) : {} } catch { return null }
}

async function resolverSucursal(session: NonNullable<Awaited<ReturnType<typeof requireSession>>>, pedida: unknown) {
  const efectiva = await sucursalEfectiva(session)
  const branchId = typeof pedida === 'string' && pedida.trim() ? pedida.trim() : (session.user.branchId || efectiva)
  if (!branchId) return { branchId: null, denied: false }
  if (SELLER_ROLES.includes(session.user.role) && branchId !== (efectiva ?? session.user.branchId)) return { branchId, denied: true }
  return { branchId, denied: false }
}

const respuestaError = (cause: unknown, fallback: string) => {
  if (cause instanceof HoldError) return json({ message: cause.message, ...(cause.details ?? {}) }, { status: cause.status })
  console.error('[cart-holds]', cause)
  return error(fallback, 500)
}

export async function POST(request: Request) {
  const moduloApagado = await moduloGuard(request, ['stock-avanzado', 'inventario-unidades']); if (moduloApagado) return moduloApagado
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, POS_PERMISSIONS)) return error('No autorizado.', 403)
  const body = await leerCuerpo(request)
  if (!body || typeof body !== 'object') return error('JSON inválido.')
  if (body.action === 'release') return liberar(session, tenant, body)
  const cartId = id(body.cartId)
  const deviceId = body.deviceId ? id(body.deviceId) || null : null
  const serials: string[] = (Array.isArray(body.serials) ? body.serials : []).map(serialKey).filter(Boolean)
  if (!cartId) return error('Falta el identificador del carrito.')
  if (!serials.length || serials.length > HOLD_MAX_PER_SELLER || new Set(serials).size !== serials.length) return error(`Indicá de 1 a ${HOLD_MAX_PER_SELLER} IMEI/seriales distintos.`)
  const { branchId, denied } = await resolverSucursal(session, body.branchId)
  if (!branchId) return error('Tu usuario no tiene sucursal para apartar equipos.', 409)
  if (denied) return error('No autorizado para apartar equipos de otra sucursal.', 403)
  try {
    const result = await prisma.$transaction(async tx => {
      const held = await holdUnits(tx, { tenant, branchId, userId: session.user.id, cartId, deviceId, serials })
      return { held, serverNow: await serverNow(tx) }
    })
    return json({
      held: result.held.map(unit => ({ serial: unit.serial, reservedUntil: unit.reservedUntil, holdStartedAt: unit.holdStartedAt, secondsLeft: Math.max(0, Math.ceil((Date.parse(unit.reservedUntil) - Date.parse(result.serverNow)) / 1000)) })),
      ttlSeconds: HOLD_SECONDS, maxMinutes: HOLD_MAX_MINUTES, serverNow: result.serverNow,
    }, { status: 201 })
  } catch (cause) {
    if (cause instanceof HoldError) {
      const now = await prisma.$transaction(tx => serverNow(tx))
      return json({ message: cause.message, ...(cause.details ?? {}), serverNow: now }, { status: cause.status })
    }
    return respuestaError(cause, 'No se pudo apartar el equipo.')
  }
}

async function liberar(session: NonNullable<Awaited<ReturnType<typeof requireSession>>>, tenant: string, body: any) {
  const cartId = body.cartId ? id(body.cartId) : ''
  const serials: string[] = (Array.isArray(body.serials) ? body.serials : []).map(serialKey).filter(Boolean)
  if (serials.length > 50 || new Set(serials).size !== serials.length) return error('IMEI/seriales únicos, hasta 50.')
  if (!cartId && !serials.length) return error('Indicá el carrito o los IMEI a liberar.')
  const canReleaseOthers = hasPermission(session.user, 'stock:manage')
  const branchScope = session.user.role === 'ADMIN' ? null : (session.user.branchId ?? null)
  try {
    const result = await prisma.$transaction(async tx => ({
      ...(await releaseHolds(tx, { tenant, userId: session.user.id, cartId: serials.length ? null : cartId, serials, canReleaseOthers, branchScope })),
      serverNow: await serverNow(tx),
    }))
    return json(result)
  } catch (cause) { return respuestaError(cause, 'No se pudo liberar el equipo.') }
}

export async function PATCH(request: Request) {
  const moduloApagado = await moduloGuard(request, ['stock-avanzado', 'inventario-unidades']); if (moduloApagado) return moduloApagado
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, POS_PERMISSIONS)) return error('No autorizado.', 403)
  const body = await leerCuerpo(request)
  if (!body || typeof body !== 'object') return error('JSON inválido.')
  if (body.action === 'release') return liberar(session, tenant, body)
  if (body.action !== 'renew') return error('Acción inválida.')
  const cartId = id(body.cartId)
  if (!cartId) return error('Falta el identificador del carrito.')
  const serials: string[] = (Array.isArray(body.serials) ? body.serials : []).map(serialKey).filter(Boolean)
  try {
    const result = await prisma.$transaction(async tx => {
      const renewed = await renewHolds(tx, { tenant, userId: session.user.id, cartId, serials })
      return { renewed, now: await serverNow(tx) }
    })
    const vivos = new Set(result.renewed.map(unit => unit.serial))
    return json({
      held: result.renewed.map(unit => ({ serial: unit.serial, reservedUntil: unit.reservedUntil, holdStartedAt: unit.holdStartedAt, capped: unit.capped, secondsLeft: Math.max(0, Math.ceil((Date.parse(unit.reservedUntil) - Date.parse(result.now)) / 1000)) })),
      lost: serials.filter(serial => !vivos.has(serial)),
      serverNow: result.now,
    })
  } catch (cause) { return respuestaError(cause, 'No se pudo renovar el apartado.') }
}
