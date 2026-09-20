import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError } from '../../../lib/payment-input'

// La auditoría es la memoria del negocio: quién hizo qué y cuándo. Solo la ven
// administración y gerencia, porque incluye movimientos de equipo y de dinero.
const ROLES = ['ADMIN', 'GERENTE']
const MAX_LIMIT = 200

export async function GET(request: Request) {
  try {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!ROLES.includes(session.user.role)) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || 50))
  const cursor = params.get('cursor')
  const action = (params.get('action') || '').trim().slice(0, 80)
  const entity = (params.get('entity') || '').trim().slice(0, 200)
  // El panel agrupa áreas con comas (PrintJob,PrintBridge,PrintPrinter).
  const entities = entity.split(',').map((valor) => valor.trim()).filter(Boolean)
  const q = (params.get('q') || '').trim().slice(0, 120)
  // El panel filtra con `userId`; se acepta `actor` como alias.
  const actor = (params.get('actor') || params.get('userId') || '').trim().slice(0, 64)
  // Rango por días hacia atrás: el reloj que importa es el de los movimientos.
  const rango = (params.get('rango') || 'todo').trim()
  const dias = rango === 'hoy' ? 1 : rango === 'semana' ? 7 : rango === 'mes' ? 30 : 0
  // Rango explícito por fecha (lo usan el panel y la exportación): una fecha
  // inválida se rechaza en vez de ignorarse.
  const desdeTexto = (params.get('desde') || '').trim()
  const hastaTexto = (params.get('hasta') || '').trim()
  const fecha = (valor: string, nombre: string) => {
    if (!valor) return null
    const cuando = new Date(valor)
    if (Number.isNaN(cuando.getTime())) throw new InputError(`La fecha ${nombre} no es válida.`)
    return cuando
  }
  const desde = fecha(desdeTexto, 'desde') ?? (dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : null)
  const hasta = fecha(hastaTexto, 'hasta')
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: tenant,
      ...(action ? { action } : {}),
      ...(entities.length === 1 ? { entity: entities[0] } : entities.length > 1 ? { entity: { in: entities } } : {}),
      ...(actor ? { userId: actor } : {}),
      ...((desde || hasta) ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
      // La búsqueda también entra en el metadato: IMEI, jobId, impresora…
      ...(q ? { OR: [
        { action: { contains: q, mode: 'insensitive' as const } },
        { entityId: { contains: q, mode: 'insensitive' as const } },
        // searchText lo mantiene un trigger en la base (acción + entidad + id + metadato).
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
