import { Prisma } from '@prisma/client'
import { hasPermission, requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { InputError } from '../../../../../lib/payment-input'
import { normalizarImpresora } from '../../../../../lib/print-bridge'
import { cambiosDeImpresora, resumenImpresora } from '../../../../../lib/print-audit'

// Edición de una impresora (solo ADMIN): se valida el estado final, no el
// parche, para que ningún cambio parcial deje datos incoherentes.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'print:manage')) return error('No autorizado.', 403)
  const { id } = await context.params
  const tenantId = session.user.tenantId
  const actual = await prisma.printPrinter.findFirst({ where: { id, tenantId } })
  if (!actual) return error('Impresora no encontrada.', 404)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Datos de impresora inválidos.')
  const entrada = body as Record<string, unknown>
  const tomar = (campo: keyof typeof actual) => (entrada[campo] === undefined ? actual[campo] : entrada[campo])
  let impresora
  try {
    impresora = normalizarImpresora({
      name: tomar('name'),
      brand: tomar('brand'),
      model: tomar('model'),
      location: tomar('location'),
      connection: tomar('connection'),
      destination: tomar('destination'),
      width: tomar('width'),
      copies: tomar('copies'),
      cut: tomar('cut'),
      density: tomar('density'),
      characters: tomar('characters'),
      isDefault: tomar('isDefault'),
      isActive: tomar('isActive'),
      bridgeId: tomar('bridgeId'),
      branchId: tomar('branchId'),
    })
  } catch (cause) {
    return error(cause instanceof InputError ? cause.message : 'Datos de impresora inválidos.', cause instanceof InputError ? cause.status : 400)
  }
  if (impresora.bridgeId) {
    const puente = await prisma.printBridge.findFirst({ where: { id: impresora.bridgeId, tenantId, revokedAt: null }, select: { id: true } })
    if (!puente) return error('El puente elegido no existe o está revocado.')
  }
  if (impresora.branchId) {
    const sucursal = await prisma.branch.findFirst({ where: { id: impresora.branchId, tenantId }, select: { id: true } })
    if (!sucursal) return error('La sucursal elegida no existe en la empresa.', 404)
  }
  const lastTest = entrada.lastTest === undefined ? undefined : entrada.lastTest === null ? Prisma.JsonNull : (entrada.lastTest as Prisma.InputJsonValue)
  try {
    const guardada = await prisma.$transaction(async tx => {
      const anteriorPredeterminada = impresora.isDefault && !actual.isDefault
        ? await tx.printPrinter.findFirst({ where: { tenantId, isDefault: true, id: { not: id } }, select: { id: true, name: true } })
        : null
      if (impresora.isDefault) await tx.printPrinter.updateMany({ where: { tenantId, isDefault: true, id: { not: id } }, data: { isDefault: false } })
      const actualizada = await tx.printPrinter.update({ where: { id }, data: { ...impresora, ...(lastTest === undefined ? {} : { lastTest }) } })
      // Un solo registro de cambio con el antes/después de cada campo; los
      // eventos puntuales (predeterminada, activa/inactiva) se suman aparte
      // para que el historial se lea sin interpretar el diff.
      const cambios = cambiosDeImpresora(actual, actualizada)
      if (Object.keys(cambios).length > 0) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id,
            action: 'PRINT_PRINTER_UPDATED',
            entity: 'PrintPrinter',
            entityId: actualizada.id,
            metadata: { printerId: actualizada.id, name: actualizada.name, changes: cambios },
          },
        })
      }
      if (!actual.isDefault && actualizada.isDefault) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id,
            action: 'PRINT_DEFAULT_PRINTER_CHANGED',
            entity: 'PrintPrinter',
            entityId: actualizada.id,
            metadata: { printerId: actualizada.id, name: actualizada.name, previousDefaultId: anteriorPredeterminada?.id ?? null, previousDefaultName: anteriorPredeterminada?.name ?? null },
          },
        })
      }
      if (actual.isActive !== actualizada.isActive) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id,
            action: actualizada.isActive ? 'PRINT_PRINTER_ENABLED' : 'PRINT_PRINTER_DISABLED',
            entity: 'PrintPrinter',
            entityId: actualizada.id,
            metadata: { printerId: actualizada.id, name: actualizada.name },
          },
        })
      }
      return actualizada
    })
    return json(guardada)
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') return error('Ya existe una impresora con ese destino en la empresa.', 409)
    return error('No se pudo actualizar la impresora.', 500)
  }
}

// Baja de una impresora (solo ADMIN). Los trabajos ya encolados conservan su
// destino y quedan sin impresora asociada (FK SetNull).
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'print:manage')) return error('No autorizado.', 403)
  const { id } = await context.params
  const tenantId = session.user.tenantId
  const borrada = await prisma.$transaction(async tx => {
    const actual = await tx.printPrinter.findFirst({ where: { id, tenantId } })
    if (!actual) return null
    await tx.printPrinter.delete({ where: { id: actual.id } })
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        action: 'PRINT_PRINTER_DELETED',
        entity: 'PrintPrinter',
        entityId: actual.id,
        metadata: { ...resumenImpresora(actual), bridgeId: actual.bridgeId ?? null },
      },
    })
    return actual
  })
  if (!borrada) return error('Impresora no encontrada.', 404)
  return json({ ok: true })
}
