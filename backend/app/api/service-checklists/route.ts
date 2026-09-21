import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

const DEVICE_TYPES = ['iPhone', 'MacBook', 'AirPods', 'iPad', 'Apple Watch', 'Otros']
const MAX_PUNTOS = 40
const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

// Checklist de recepción configurable por tipo de dispositivo (#122). La orden
// guarda lo marcado en `ServiceOrder.checklist`; esta tabla define qué puntos se
// ofrecen al recibir. Los puntos se desactivan (nunca se borran) para no perder
// el checklist histórico de las órdenes ya cargadas.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['service:manage'])) return error('No autorizado.', 403)
  const deviceType = (new URL(request.url).searchParams.get('deviceType') || '').trim()
  const items = await prisma.serviceChecklistItem.findMany({
    where: { tenantId: tenant, isActive: true, ...(DEVICE_TYPES.includes(deviceType) ? { deviceType } : {}) },
    orderBy: [{ deviceType: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    take: 500,
  })
  return json(items)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['service:manage'])) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const deviceType = DEVICE_TYPES.includes(String(body.deviceType)) ? String(body.deviceType) : 'iPhone'
    // Alta en lote (checklist sugerido) o de a uno.
    const etiquetas: string[] = Array.isArray(body.labels)
      ? body.labels.map(etiqueta => clean(etiqueta, 80)).filter((etiqueta): etiqueta is string => Boolean(etiqueta))
      : [clean(body.label, 80)].filter((etiqueta): etiqueta is string => Boolean(etiqueta))
    if (!etiquetas.length) throw new InputError('Indicá al menos un punto del checklist.')
    if (etiquetas.length > MAX_PUNTOS) throw new InputError(`El checklist admite hasta ${MAX_PUNTOS} puntos.`)
    const actuales = await prisma.serviceChecklistItem.findMany({ where: { tenantId: tenant, deviceType }, select: { label: true, sortOrder: true } })
    const usados = new Set(actuales.map(item => item.label))
    let orden = actuales.reduce((maximo, item) => Math.max(maximo, item.sortOrder), 0)
    for (const label of etiquetas) {
      if (usados.has(label)) {
        // Reactivar un punto apagado conserva su lugar en la lista.
        await prisma.serviceChecklistItem.update({ where: { tenantId_deviceType_label: { tenantId: tenant, deviceType, label } }, data: { isActive: true } })
        continue
      }
      orden += 1
      await prisma.serviceChecklistItem.create({ data: { tenantId: tenant, deviceType, label, sortOrder: orden } })
    }
    const items = await prisma.serviceChecklistItem.findMany({ where: { tenantId: tenant, deviceType, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] })
    return json(items, { status: 201 })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo guardar el checklist.', 400)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['service:manage'])) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'id', 200)
    const existing = await prisma.serviceChecklistItem.findFirst({ where: { id, tenantId: tenant } })
    if (!existing) return error('Punto del checklist no encontrado.', 404)
    const label = body.label === undefined ? undefined : clean(body.label, 80)
    if (label !== undefined && !label) throw new InputError('El nombre del punto no puede quedar vacío.')
    const sortOrder = body.sortOrder === undefined ? undefined : Number(body.sortOrder)
    if (sortOrder !== undefined && (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 999)) throw new InputError('Orden inválido.')
    const updated = await prisma.serviceChecklistItem.update({
      where: { id: existing.id },
      data: {
        ...(label === undefined ? {} : { label }),
        ...(sortOrder === undefined ? {} : { sortOrder }),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive === true }),
      },
    })
    return json(updated)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el checklist.', 400)
  }
}
