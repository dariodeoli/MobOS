import { requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { cancelarTrabajos, textoOpcional } from '../../../../../lib/print-jobs'

const ROLES_QUE_CANCELAN = ['ADMIN', 'GERENTE']

// Cancelación en lote (#128): por selección de ids y/o por impresora y tipo.
// Cancela SOLO los PENDIENTES (las mismas reglas que la individual) y audita
// un PRINT_JOB_CANCELLED por trabajo, con el actor real y `via: 'lote'`.
// Existe para el caso real del local: el puente estuvo caído, alguien apretó
// Imprimir varias veces y hay N copias esperando que no deben salir.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_QUE_CANCELAN.includes(session.user.role)) return error('Solo administración o gerencia cancelan trabajos de impresión.', 403)

  const body = await request.json().catch(() => null)
  const entrada = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const ids = Array.isArray(entrada.ids) ? entrada.ids.filter((valor) => typeof valor === 'string') : []
  const printerId = textoOpcional(entrada.printerId ?? entrada.impresoraId, 60)
  const kind = textoOpcional(entrada.kind ?? entrada.tipo, 40)
  if (!ids.length && !printerId && !kind) return error('Elegí qué cancelar: trabajos seleccionados, una impresora o un tipo.')

  const cancelados = await cancelarTrabajos(prisma, session.user.tenantId, { ids, printerId, kind }, { userId: session.user.id, via: 'lote' })
  return json({
    ok: true,
    total: cancelados.length,
    cancelados: cancelados.map((trabajo) => ({
      id: trabajo.id,
      kind: trabajo.kind,
      reference: trabajo.reference,
      printerName: trabajo.printerName,
      bridgeName: trabajo.bridgeName,
    })),
  })
}
