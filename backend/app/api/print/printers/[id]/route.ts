import { Prisma } from '@prisma/client'
import { requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { InputError } from '../../../../../lib/payment-input'
import { normalizarImpresora } from '../../../../../lib/print-bridge'
import { diffCampos } from '../../../../../lib/audit'

// Campos de impresora que dejan rastro: la prueba de impresión (lastTest) es
// operativa y no ensucia la auditoría.
const CAMPOS_IMPRESORA = ['name', 'brand', 'model', 'location', 'connection', 'destination', 'width', 'copies', 'cut', 'density', 'characters', 'isDefault', 'isActive', 'bridgeId'] as const

// Edición de una impresora (solo ADMIN): se valida el estado final, no el
// parche, para que ningún cambio parcial deje datos incoherentes.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
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
    })
  } catch (cause) {
    return error(cause instanceof InputError ? cause.message : 'Datos de impresora inválidos.', cause instanceof InputError ? cause.status : 400)
  }
  if (impresora.bridgeId) {
    const puente = await prisma.printBridge.findFirst({ where: { id: impresora.bridgeId, tenantId, revokedAt: null }, select: { id: true } })
    if (!puente) return error('El puente elegido no existe o está revocado.')
  }
  const lastTest = entrada.lastTest === undefined ? undefined : entrada.lastTest === null ? Prisma.JsonNull : (entrada.lastTest as Prisma.InputJsonValue)
  const cambios = diffCampos(actual, impresora, CAMPOS_IMPRESORA)
  try {
    const guardada = await prisma.$transaction(async tx => {
      if (impresora.isDefault) await tx.printPrinter.updateMany({ where: { tenantId, isDefault: true, id: { not: id } }, data: { isDefault: false } })
      const actualizada = await tx.printPrinter.update({ where: { id }, data: { ...impresora, ...(lastTest === undefined ? {} : { lastTest }) } })
      if (Object.keys(cambios).length) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id,
            action: 'PRINT_PRINTER_UPDATED',
            entity: 'PrintPrinter',
            entityId: id,
            metadata: cambios as Prisma.InputJsonValue,
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
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const { id } = await context.params
  const tenantId = session.user.tenantId
  const actual = await prisma.printPrinter.findFirst({ where: { id, tenantId }, select: { name: true, destination: true } })
  if (!actual) return error('Impresora no encontrada.', 404)
  const borrada = await prisma.$transaction(async tx => {
    const resultado = await tx.printPrinter.deleteMany({ where: { id, tenantId } })
    if (resultado.count === 0) return resultado
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        action: 'PRINT_PRINTER_DELETED',
        entity: 'PrintPrinter',
        entityId: id,
        metadata: { name: actual.name, destination: actual.destination },
      },
    })
    return resultado
  })
  if (borrada.count === 0) return error('Impresora no encontrada.', 404)
  return json({ ok: true })
}
