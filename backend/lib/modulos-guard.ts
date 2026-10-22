import { prisma } from './prisma'
import { requireAccountContext, requireSession, type SessionContext } from './auth'
import { error } from './http'
import { InputError } from './payment-input'
import { moduloActivo, moduloDef } from './modulos-catalogo.mjs'
import { MODULOS_POR_DATOS, asegurarModulosPorDatos, type DbAsegurar } from './modulos-datos'

/** Mensaje claro para el usuario cuando el módulo está apagado. */
export function moduloApagadoMensaje(id: string) {
  const nombre = moduloDef(id)?.name ?? id
  return `El módulo «${nombre}» está desactivado para esta empresa. Activalo en Configuración › Módulos.`
}

/** Estado del módulo para la empresa (settings.moduleStore); núcleo siempre activo. */
export async function moduloHabilitado(tenantId: string, id: string): Promise<boolean> {
  const def = moduloDef(id)
  if (def?.nucleo) return true
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  if (!tenant) return false
  // Empresa existente sin decisión guardada: se decide por sus datos (una sola vez).
  const settings = MODULOS_POR_DATOS.includes(id) ? await asegurarModulosPorDatos(prisma as unknown as DbAsegurar, tenantId, tenant.settings) : tenant.settings
  return moduloActivo({ settings }, id)
}

/** Lanza 403 si el módulo está apagado. Para las escrituras de cada apiPrefix. */
export async function assertModulo(tenantId: string, id: string): Promise<void> {
  if (!await moduloHabilitado(tenantId, id)) throw new InputError(moduloApagadoMensaje(id), 403)
}

const LECTURAS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Guarda para un handler de ruta: las lecturas pasan siempre (historial y
 * reportes siguen visibles), las escrituras (POST/PUT/PATCH/DELETE) responden
 * 403 si el módulo está apagado. Resuelve la empresa desde la sesión; sin
 * sesión no decide (devuelve null y el handler responde 401 como siempre).
 * Uso: `const apagado = await moduloGuard(request, 'tradein'); if (apagado) return apagado`
 */
export async function moduloGuard(request: Request, id: string | readonly string[], tenantId?: string): Promise<Response | null> {
  if (LECTURAS.has(request.method.toUpperCase())) return null
  const tenant = tenantId ?? (await requireSession(request))?.user.tenantId
  if (!tenant) return null
  // Con varios ids alcanza que uno esté activo (p. ej. reservas: stock avanzado o inventario por unidades).
  const ids = typeof id === 'string' ? [id] : id
  for (const candidato of ids) if (await moduloHabilitado(tenant, candidato)) return null
  return error(moduloApagadoMensaje(ids[0]), 403)
}

/**
 * Dueño real de la empresa: membresía OWNER vigente de la cuenta de la sesión.
 * Ni la contraseña compartida ni un ADMIN alcanzan (mismo criterio que deliveryAccess).
 */
export async function esDuenoReal(request: Request, session: SessionContext): Promise<boolean> {
  if (!session.accountId) return false
  const account = await requireAccountContext(request)
  if (!account || account.tenantId !== session.user.tenantId || account.sellerUserId !== session.user.id) return false
  const membership = await prisma.tenantMembership.findFirst({ where: { tenantId: account.tenantId, accountId: account.accountId, userId: session.user.id, role: 'OWNER', revokedAt: null }, select: { id: true } })
  return Boolean(membership)
}
