import { Prisma } from '@prisma/client'
import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { POLICY_MAX_CHARS, isPolicyType, policiesFrom, sanitizePolicyText } from '../../../../../lib/policies'

// Guarda una política de la empresa (#433). Solo el dueño (ADMIN), siempre
// dentro de su propia empresa (el tenant sale de la sesión, nunca del cuerpo),
// con auditoría. Publicar exige texto.
export async function PUT(request: Request, context: { params: Promise<{ type: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede editar las políticas.', 403)
  const { type } = await context.params
  if (!isPolicyType(type)) return error('Política desconocida.', 404)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.content !== 'string' || typeof body.published !== 'boolean') return error('Indicá el texto y si se publica.', 400)
  const published: boolean = body.published
  const content = sanitizePolicyText(body.content)
  if (content.length > POLICY_MAX_CHARS) return error(`El texto supera el máximo de ${POLICY_MAX_CHARS} caracteres.`, 400)
  if (published && !content) return error('Escribí el texto antes de publicar la política.', 400)
  const updatedAt = new Date().toISOString()
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
      const settings = current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings) ? current.settings as Record<string, unknown> : {}
      const before = policiesFrom(settings)[type]
      const stored = settings.policies && typeof settings.policies === 'object' && !Array.isArray(settings.policies) ? settings.policies as Record<string, unknown> : {}
      await tx.tenant.update({
        where: { id: session.user.tenantId },
        data: { settings: { ...settings, policies: { ...stored, [type]: { content, published, updatedAt } } } as Prisma.InputJsonObject },
      })
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_POLICY_UPDATED', entity: 'Tenant', entityId: session.user.tenantId,
          metadata: { type, publishedBefore: before.published, publishedAfter: published, lengthBefore: before.content.length, lengthAfter: content.length },
        },
      })
    })
  } catch (cause) {
    console.error('[tenant/policies] no se pudo guardar:', cause)
    return error('No se pudo guardar la política.', 500)
  }
  return json({ ok: true, type, content, published, updatedAt })
}
