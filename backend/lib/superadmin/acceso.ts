import { NextResponse } from 'next/server'
import { prisma } from '../prisma'
import { requireSession } from '../auth'
import { logError, logInfo } from '../log'
import { enforceRateLimit } from '../rate-limit'
import { correoDuenoPlataforma, motivoDenegacion, type MotivoDenegado } from './acceso-reglas'

export type DuenoPlataforma = { userId: string; tenantId: string }

/**
 * Relee usuario, cuenta e identidad de Google en la base (no confía en lo que
 * trae la sesión) y decide. Devuelve el motivo de la denegación, sin datos
 * personales, o null si es el dueño.
 */
export async function evaluarAccesoPlataforma(sesion: { userId: string; accountId: string | null }, correoDueno = correoDuenoPlataforma()): Promise<{ motivo: MotivoDenegado | null; tenantId: string | null }> {
  const usuario = await prisma.user.findUnique({ where: { id: sesion.userId }, select: { tenantId: true, status: true } })
  const cuenta = sesion.accountId ? await prisma.account.findUnique({ where: { id: sesion.accountId }, select: { googleSubject: true } }) : null
  const identidad = cuenta?.googleSubject ? await prisma.googleIdentity.findUnique({ where: { subject: cuenta.googleSubject }, select: { subject: true, email: true } }) : null
  return { motivo: motivoDenegacion({ correoDueno, usuario, cuenta, identidad }), tenantId: usuario?.tenantId ?? null }
}

/**
 * Guard único del panel de plataforma. Cualquier falla o error de base
 * devuelve null; las denegaciones con sesión se registran (sin PII).
 */
export async function requerirAdministradorPlataforma(request: Request): Promise<DuenoPlataforma | null> {
  try {
    const sesion = await requireSession(request)
    if (!sesion) return null
    const { motivo, tenantId } = await evaluarAccesoPlataforma({ userId: sesion.user.id, accountId: sesion.accountId ?? null })
    if (motivo || !tenantId) {
      logInfo('superadmin_acceso_denegado', { motivo: motivo ?? 'sin_empresa' })
      return null
    }
    return { userId: sesion.user.id, tenantId }
  } catch (error) {
    logError('superadmin_guard_error', { reason: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export function noEncontrado() {
  return NextResponse.json({ message: 'No encontrado.' }, { status: 404 })
}

type Contexto = { params: Record<string, string> }

/**
 * Envuelve un handler de /api/superadmin/*: sin acceso responde 404 sin revelar
 * que el panel existe (también al exceder el límite de intentos); con acceso,
 * ejecuta el handler. Todo handler del panel se exporta con este envoltorio.
 */
export function conAdministradorPlataforma(handler: (request: Request, dueno: DuenoPlataforma, contexto: Contexto) => Promise<Response>) {
  return async (request: Request, contexto: { params: Promise<Record<string, string>> }): Promise<Response> => {
    // El límite va ANTES de consultar la base y responde igual que una ruta inexistente.
    if (enforceRateLimit(request, 'superadmin', 120, 60_000)) {
      logInfo('superadmin_acceso_denegado', { motivo: 'limite_de_intentos' })
      return noEncontrado()
    }
    const dueno = await requerirAdministradorPlataforma(request)
    if (!dueno) return noEncontrado()
    try {
      return await handler(request, dueno, { params: await contexto.params })
    } catch (error) {
      logError('superadmin_handler_error', { reason: error instanceof Error ? error.message : String(error) })
      return NextResponse.json({ message: 'No se pudo cargar el panel.' }, { status: 500 })
    }
  }
}
