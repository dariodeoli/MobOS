import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { InputError } from '../../../lib/payment-input'

// La auditoría es la memoria del negocio: quién hizo qué y cuándo. Solo la ven
// administración y gerencia, porque incluye movimientos de equipo y de dinero.
const MAX_LIMIT = 200

export async function GET(request: Request) {
  try {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['reports:read'])) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || 50))
  const cursor = params.get('cursor')
  const action = (params.get('action') || '').trim().slice(0, 80)
  const entity = (params.get('entity') || '').trim().slice(0, 300)
  const entities = entity ? [...new Set(entity.split(',').map(value => value.trim()).filter(Boolean))].slice(0, 12) : []
  const q = (params.get('q') || '').trim().slice(0, 120)
  const userId = (params.get('userId') || params.get('actor') || '').trim().slice(0, 64)
  // Rango por días hacia atrás: el reloj que importa es el de los movimientos.
  const rango = (params.get('rango') || 'todo').trim()
  const dias = rango === 'hoy' ? 1 : rango === 'semana' ? 7 : rango === 'mes' ? 30 : 0
  // Fechas explícitas (desde/hasta en ISO) para la exportación y los filtros
  // avanzados: tienen prioridad sobre el rango rápido.
  const desdeParam = (params.get('desde') || '').trim()
  const hastaParam = (params.get('hasta') || '').trim()
  let desde = dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : null
  let hasta: Date | null = null
  // Una fecha sin hora (YYYY-MM-DD) se interpreta en la hora local del equipo
  // (mediodía local del día pedido), no en UTC: el panel y los tests comparan
  // contra medianoche local y con UTC se colaban movimientos del día anterior.
  const fechaLocal = (valor: string, finDelDia: boolean) => {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
    if (partes) {
      const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
      const cuando = new Date(anio, mes - 1, dia, finDelDia ? 23 : 0, finDelDia ? 59 : 0, finDelDia ? 59 : 0, finDelDia ? 999 : 0)
      // Si el día no existe (2026-02-30) el constructor lo desborda: se rechaza.
      if (cuando.getFullYear() !== anio || cuando.getMonth() !== mes - 1 || cuando.getDate() !== dia) return null
      return cuando
    }
    const cuando = new Date(valor)
    return Number.isNaN(cuando.getTime()) ? null : cuando
  }
  if (desdeParam) {
    const value = fechaLocal(desdeParam, false)
    if (!value) return error('Fecha desde inválida.')
    desde = value
  }
  if (hastaParam) {
    const value = fechaLocal(hastaParam, true)
    if (!value) return error('Fecha hasta inválida.')
    hasta = value
  }
  if (desde && hasta && desde.getTime() > hasta.getTime()) return error('El rango de fechas está invertido.')
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: tenant,
      ...(action ? { action } : {}),
      ...(entities.length === 1 ? { entity: entities[0] } : entities.length ? { entity: { in: entities } } : {}),
      ...(userId ? { userId } : {}),
      ...(desde || hasta ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
      // La búsqueda entra en el metadato vía la columna denormalizada que
      // mantiene el trigger (misma semántica que la exportación CSV).
      ...(q ? { OR: [
        { action: { contains: q, mode: 'insensitive' as const } },
        { entityId: { contains: q, mode: 'insensitive' as const } },
        { searchText: { contains: q.toLowerCase() } },
      ] } : {}),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  return json(rows)
  } catch (e) { return error(e instanceof InputError ? e.message : 'Parámetros inválidos.', 400) }
}
