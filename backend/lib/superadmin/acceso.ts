import { NextResponse } from 'next/server'
import { prisma } from '../prisma'
import { requireSession } from '../auth'
import { correoDuenoPlataforma, decidirAcceso } from './acceso-reglas'

export type DuenoPlataforma = { userId: string; tenantId: string }

/**
 * Guard único del panel de plataforma. Relee al usuario, la cuenta y la empresa
 * en la base en CADA request (no confía en lo cacheado en la sesión) y exige
 * usuario activo + correo exacto del dueño (entorno) + correo verificado o
 * cuenta de Google. Cualquier falla o error de base devuelve null.
 */
export async function requerirAdministradorPlataforma(request: Request): Promise<DuenoPlataforma | null> {
  try {
    const correoDueno = correoDuenoPlataforma()
    if (!correoDueno) return null
    const sesion = await requireSession(request)
    if (!sesion) return null
    const usuario = await prisma.user.findUnique({ where: { id: sesion.user.id }, select: { id: true, tenantId: true, status: true, email: true } })
    if (!usuario) return null
    const [cuenta, empresa] = await Promise.all([
      sesion.accountId ? prisma.account.findUnique({ where: { id: sesion.accountId }, select: { email: true, googleSubject: true } }) : null,
      prisma.tenant.findUnique({ where: { id: usuario.tenantId }, select: { email: true, emailVerifiedAt: true } }),
    ])
    return decidirAcceso({ correoDueno, usuario, cuenta, empresa }) ? { userId: usuario.id, tenantId: usuario.tenantId } : null
  } catch (error) {
    console.error('[superadmin] no se pudo validar el acceso:', error)
    return null
  }
}

export function noEncontrado() {
  return NextResponse.json({ message: 'No encontrado.' }, { status: 404 })
}

type Contexto = { params: Record<string, string> }

/**
 * Envuelve un handler de /api/superadmin/*: sin acceso responde 404 sin revelar
 * que el panel existe; con acceso, ejecuta el handler. Todo handler del panel
 * se exporta con este envoltorio (un test lo exige por cada ruta).
 */
export function conAdministradorPlataforma(handler: (request: Request, dueno: DuenoPlataforma, contexto: Contexto) => Promise<Response>) {
  return async (request: Request, contexto: Contexto): Promise<Response> => {
    const dueno = await requerirAdministradorPlataforma(request)
    if (!dueno) return noEncontrado()
    try {
      return await handler(request, dueno, contexto)
    } catch (error) {
      console.error('[superadmin] error en el panel:', error)
      return NextResponse.json({ message: 'No se pudo cargar el panel.' }, { status: 500 })
    }
  }
}
