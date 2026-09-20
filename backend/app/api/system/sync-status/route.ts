import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { estaEnLinea } from '../../../../lib/presence'

const ULTIMOS = 5
const VENTANA_ERRORES_HORAS = 24

// Monitor de sincronización: puentes e impresoras, cola de impresión, correo
// saliente, webhooks de AEX, errores recientes y reservas vencidas, todo de la
// empresa de la sesión. Solo lectura: no reintenta ni libera nada.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['reports:read', 'cash:manage', 'stock:manage'])) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const ahora = new Date()
  const desdeErrores = new Date(ahora.getTime() - VENTANA_ERRORES_HORAS * 60 * 60 * 1000)

  const [
    puentes,
    impresoras,
    trabajosPendientes,
    trabajosFallidos,
    ultimoTrabajoOk,
    emailsPendientes,
    emailsFallidos,
    ultimoEventoAex,
    eventosAex,
    erroresRecientes,
    ultimosErrores,
    reservasVencidas,
  ] = await Promise.all([
    prisma.printBridge.findMany({ where: { tenantId, revokedAt: null }, select: { id: true, lastSeenAt: true } }),
    prisma.printPrinter.findMany({ where: { tenantId, isActive: true }, select: { bridgeId: true } }),
    prisma.printJob.count({ where: { tenantId, state: { in: ['PENDIENTE', 'RECLAMADO'] } } }),
    prisma.printJob.count({ where: { tenantId, state: 'FALLIDO' } }),
    prisma.printJob.aggregate({ where: { tenantId, state: 'CONFIRMADO' }, _max: { confirmedAt: true } }),
    prisma.emailOutbox.count({ where: { tenantId, sentAt: null, cancelledAt: null, failedAt: null } }),
    prisma.emailOutbox.count({ where: { tenantId, failedAt: { not: null } } }),
    prisma.aexWebhookEvent.aggregate({ where: { tenantId }, _max: { recibidoEn: true } }),
    prisma.aexWebhookEvent.findMany({
      where: { tenantId },
      orderBy: { recibidoEn: 'desc' },
      take: ULTIMOS,
      select: { id: true, guia: true, estado: true, tipoEvento: true, fechaEvento: true, recibidoEn: true },
    }),
    prisma.errorReport.count({ where: { tenantId, createdAt: { gte: desdeErrores } } }),
    prisma.errorReport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: ULTIMOS,
      select: { id: true, kind: true, message: true, url: true, createdAt: true },
    }),
    prisma.inventoryUnit.count({ where: { tenantId, status: 'RESERVED', reservedUntil: { lte: ahora } } }),
  ])

  const enLinea = new Set(puentes.filter((puente) => estaEnLinea(puente.lastSeenAt, ahora)).map((puente) => puente.id))
  const conPuente = impresoras.filter((impresora) => impresora.bridgeId)
  const impresorasEnLinea = conPuente.filter((impresora) => enLinea.has(impresora.bridgeId as string)).length
  const ultimaSenal = puentes.reduce<Date | null>(
    (maxima, puente) => (puente.lastSeenAt && (!maxima || puente.lastSeenAt > maxima) ? puente.lastSeenAt : maxima),
    null,
  )

  return json({
    generadoEn: ahora.toISOString(),
    impresoras: {
      total: impresoras.length,
      enLinea: impresorasEnLinea,
      sinSenal: conPuente.length - impresorasEnLinea,
      sinPuente: impresoras.length - conPuente.length,
    },
    puentes: { total: puentes.length, activos: enLinea.size, ultimaSenal },
    trabajos: { pendientes: trabajosPendientes, fallidos: trabajosFallidos, ultimoExitoAt: ultimoTrabajoOk._max.confirmedAt },
    emails: { pendientes: emailsPendientes, fallidos: emailsFallidos },
    aex: { ultimoEventoAt: ultimoEventoAex._max.recibidoEn, ultimos: eventosAex },
    errores: { recientes: erroresRecientes, ventanaHoras: VENTANA_ERRORES_HORAS, ultimos: ultimosErrores },
    reservas: { vencidasSinLiberar: reservasVencidas },
  })
}
