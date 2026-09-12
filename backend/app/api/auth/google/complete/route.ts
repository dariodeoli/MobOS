import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import { hashToken } from '../../../../../lib/auth'
import { googleCompany } from '../../../../../lib/google-company'
import { AuthFlowError, COOKIE_COMPANY, COOKIE_IDENTITY, cookieOptions, readCookie, sameOrigin, unseal } from '../../../../../lib/google-oauth'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new AuthFlowError('origin', 'Origen de solicitud no permitido.', 403)
    const body = await request.json().catch(() => { throw new AuthFlowError('input', 'Solicitud inválida.') })
    const identity = unseal('identity', readCookie(request, COOKIE_IDENTITY))
    if (body?.action === 'create' && identity.intent !== 'create') throw new AuthFlowError('onboarding', 'Iniciá desde Crear mi tienda para confirmar el alta.', 409)
    const result = await googleCompany(identity, body).catch(error => {
      if (error instanceof AuthFlowError && error.code === 'onboarding_required' && identity.intent !== 'create') throw new AuthFlowError('start_create', 'Esta cuenta todavía no tiene tienda. Continuá desde Crear con Google.', 409)
      throw error
    })
    // Revoke the previous Google company session when switching companies.
    const previous = readCookie(request, COOKIE_COMPANY)
    if (previous) await prisma.session.updateMany({ where: { tokenHash: hashToken(previous), level: 'COMPANY' }, data: { revokedAt: new Date() } })
    const sellers = await prisma.user.findMany({ where: { tenantId: result.tenant.id, status: 'ACTIVE', OR: [{ branchId: null }, { branch: { isActive: true } }] }, select: { id: true, name: true, branchId: true }, orderBy: { name: 'asc' } })
    await prisma.auditLog.create({ data: { tenantId: result.tenant.id, action: body?.action === 'create' ? 'GOOGLE_COMPANY_CREATED_OR_SIGNED_IN' : 'GOOGLE_COMPANY_SIGNED_IN', entity: 'Session', metadata: { provider: 'google' } } })
    const response = NextResponse.json({ tenant: result.tenant, sellers, scope: 'device:company', cookieSession: true }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(COOKIE_COMPANY, result.token, cookieOptions(7 * 86400))
    response.cookies.set(COOKIE_IDENTITY, '', cookieOptions(0))
    return response
  } catch (error) {
    const known = error instanceof AuthFlowError
    return NextResponse.json({ code: known ? error.code : 'unavailable', message: known ? error.message : 'No se pudo completar el acceso. Revisá la conexión de la base de datos o intentá nuevamente.' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
