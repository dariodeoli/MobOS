import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { MAX_HORAS_SERIE, resumenImpresion } from '../../../../lib/print-metrics'

// Métricas de impresión de la empresa: totales, latencia promedio y p95 por
// impresora, serie por hora y los últimos trabajos con sus tiempos. La consulta
// vive acá; el resumen es una función pura de print-metrics.ts.
const ROLES_METRICAS = ['ADMIN', 'GERENTE']
// Tope duro de filas para que un rango amplio no traiga la tabla completa: con
// 10.000 trabajos por rango alcanza para agregados honestos de un local.
const MAX_TRABAJOS = 10_000
const HORA_MS = 60 * 60 * 1000

function fecha(valor: string | null): Date | null {
  if (!valor) return null
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_METRICAS.includes(session.user.role)) return error('Solo administración o gerencia ven las métricas de impresión.', 403)
  const url = new URL(request.url)

  const hasta = fecha(url.searchParams.get('hasta')) ?? new Date()
  const desde = fecha(url.searchParams.get('desde')) ?? new Date(hasta.getTime() - 24 * HORA_MS)
  if (desde.getTime() > hasta.getTime()) return error('El rango de fechas es inválido.')
  if (hasta.getTime() - desde.getTime() > MAX_HORAS_SERIE * HORA_MS) return error('El rango máximo de métricas es 90 días.')

  const printerId = (url.searchParams.get('printerId') || '').trim().slice(0, 60)
  const reference = (url.searchParams.get('reference') || '').trim().slice(0, 64)
  const tenantId = session.user.tenantId

  const jobs = await prisma.printJob.findMany({
    where: {
      tenantId,
      enqueuedAt: { gte: desde, lte: hasta },
      ...(printerId ? { printerId } : {}),
      ...(reference ? { reference: { startsWith: reference } } : {}),
    },
    orderBy: { enqueuedAt: 'desc' },
    take: MAX_TRABAJOS,
    select: {
      id: true,
      state: true,
      printerId: true,
      printerName: true,
      destination: true,
      transport: true,
      queueMs: true,
      durationMs: true,
      enqueuedAt: true,
      claimedAt: true,
      confirmedAt: true,
      reference: true,
    },
  })
  return json(resumenImpresion(jobs, desde, hasta))
}
