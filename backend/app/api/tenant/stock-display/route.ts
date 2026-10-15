import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { sanitizeStockDisplay, stockDisplayFrom } from '../../../../lib/stock-display'

export const dynamic = 'force-dynamic'

// Orden por defecto y colores por condición/depósito del Stock (#448). Cualquier
// usuario de la empresa lo lee (lo necesita para pintar sus filas); solo el
// dueño y el gerente lo editan. El tenant sale de la sesión, nunca del cuerpo.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  if (!tenant) return error('Empresa no encontrada.', 404)
  return json(stockDisplayFrom(tenant.settings), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN' && session.user.role !== 'GERENTE') return error('Solo el dueño o el gerente pueden cambiar la presentación del stock.', 403)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Datos inválidos.', 400)
  const stockDisplay = sanitizeStockDisplay(body)
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${session.user.tenantId} FOR UPDATE`
      const current = await tx.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
      const settings = current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings) ? current.settings as Record<string, unknown> : {}
      await tx.tenant.update({
        where: { id: session.user.tenantId },
        data: { settings: { ...settings, stockDisplay } as unknown as Prisma.InputJsonObject },
      })
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_STOCK_DISPLAY_UPDATED', entity: 'Tenant', entityId: session.user.tenantId,
          metadata: { tipoPrimero: stockDisplay.tipoPrimero, condicionPrimero: stockDisplay.condicionPrimero, depositosConColor: Object.keys(stockDisplay.colores).length, planilla: Object.keys(stockDisplay.planilla).length },
        },
      })
    })
  } catch (cause) {
    console.error('[tenant/stock-display] no se pudo guardar:', cause)
    return error('No se pudo guardar la presentación del stock.', 500)
  }
  return json(stockDisplay)
}
