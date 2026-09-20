import { hashToken, hasPermission, requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { InputError } from '../../../../../lib/payment-input'
import { generarTokenPuente, impresoraDesdeLegacy, shapePuente } from '../../../../../lib/print-bridge'

// Import único de la configuración legacy de localStorage (solo ADMIN). Es
// idempotente: reejecutarlo con `force` actualiza por destino y nombre en vez
// de duplicar. Devuelve el mapa localId → id del backend para que el cliente
// repunte sus referencias.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'print:manage')) return error('No autorizado.', 403)
  const body = await request.json().catch(() => null)
  const printers = Array.isArray(body?.printers) ? body.printers : null
  const bridges = Array.isArray(body?.bridges) ? body.bridges : []
  if (!printers) return error('El import necesita la lista de impresoras.')
  if (printers.length > 100 || bridges.length > 20) return error('El import admite hasta 100 impresoras y 20 puentes.')
  const tenantId = session.user.tenantId
  const existentes = await prisma.printPrinter.count({ where: { tenantId } })
  if (existentes > 0 && body?.force !== true) return error('Esta empresa ya importó su configuración de impresión. Reintentá con force para actualizarla.', 409)
  try {
    const resultado = await prisma.$transaction(async tx => {
      const mapBridges: Record<string, string> = {}
      for (const bruto of bridges) {
        const entrada = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {}
        const localId = typeof entrada.id === 'string' ? entrada.id : ''
        const nombre = typeof entrada.nombre === 'string' && entrada.nombre.trim() ? entrada.nombre.trim().slice(0, 120) : 'Computadora puente'
        let puente = await tx.printBridge.findFirst({ where: { tenantId, name: nombre, revokedAt: null } })
        if (!puente) puente = await tx.printBridge.create({ data: { tenantId, name: nombre, tokenHash: hashToken(generarTokenPuente()), createdByUserId: session.user.id } })
        if (localId) mapBridges[localId] = puente.id
      }
      const mapPrinters: Record<string, string> = {}
      const guardadas = []
      let creadas = 0
      let actualizadas = 0
      for (const bruto of printers) {
        const entrada = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {}
        const localId = typeof entrada.id === 'string' ? entrada.id : ''
        const impresora = impresoraDesdeLegacy(entrada)
        // Un puente local desconocido no se inventa: la impresora queda sin
        // puente asignado (el predeterminado decide al reclamar).
        const bridgeId = impresora.bridgeId && mapBridges[impresora.bridgeId] ? mapBridges[impresora.bridgeId] : null
        const datos = { ...impresora, bridgeId }
        const existente = await tx.printPrinter.findUnique({
          where: { tenantId_destination: { tenantId, destination: impresora.destination } },
          select: { id: true },
        })
        const guardada = existente
          ? await tx.printPrinter.update({ where: { id: existente.id }, data: datos })
          : await tx.printPrinter.create({ data: { ...datos, tenantId } })
        if (existente) actualizadas += 1
        else creadas += 1
        if (localId) mapPrinters[localId] = guardada.id
        guardadas.push(guardada)
      }
      // Un solo puente predeterminado local: la primera que lo pida gana.
      const predeterminada = guardadas.find(impresora => impresora.isDefault)
      if (predeterminada) await tx.printPrinter.updateMany({ where: { tenantId, isDefault: true, id: { not: predeterminada.id } }, data: { isDefault: false } })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: 'PRINT_PRINTER_IMPORTED',
          entity: 'PrintPrinter',
          metadata: { total: guardadas.length, created: creadas, updated: actualizadas, bridges: bridges.length },
        },
      })
      const activos = await tx.printBridge.findMany({ where: { tenantId, revokedAt: null }, orderBy: { createdAt: 'asc' } })
      return { printers: guardadas, bridges: activos.map(puente => shapePuente(puente)), map: { printers: mapPrinters, bridges: mapBridges } }
    })
    return json(resultado)
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    if ((cause as { code?: string })?.code === 'P2002') return error('El import encontró un destino repetido.', 409)
    return error('No se pudo importar la configuración de impresión.', 500)
  }
}
