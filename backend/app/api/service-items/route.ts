import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

const DEVICE_TYPES = ['iPhone', 'MacBook', 'AirPods', 'iPad', 'Apple Watch', 'Otros']
const INT_MAX = 2147483647
const safeInt = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= INT_MAX
const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

// Servicios sugeridos para arrancar el taller (se crean una sola vez por nombre).
const SUGERIDOS: Array<[string, string, number]> = [
  ['Cambio de display', 'iPhone', 0],
  ['Cambio de batería', 'iPhone', 0],
  ['Cambio de cámara', 'iPhone', 0],
  ['Conector de carga', 'iPhone', 0],
  ['Vidrio trasero', 'iPhone', 0],
  ['Reparación de placa', 'iPhone', 0],
  ['Diagnóstico', 'iPhone', 0],
  ['Cambio de batería', 'MacBook', 0],
  ['Cambio de teclado', 'MacBook', 0],
  ['Cambio de display', 'MacBook', 0],
  ['Limpieza y mantenimiento', 'MacBook', 0],
  ['Cambio de batería', 'AirPods', 0],
  ['Limpieza de AirPods', 'AirPods', 0],
]

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['service:manage'])) return error('No autorizado.', 403)
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80)
  const items = await prisma.serviceItem.findMany({
    where: { tenantId: tenant, isActive: true, ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}) },
    orderBy: [{ deviceType: 'asc' }, { name: 'asc' }],
  })
  return json(items)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['service:manage'])) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    if (body.defaults === true) {
      for (const [name, deviceType, price] of SUGERIDOS) {
        await prisma.serviceItem.upsert({
          where: { tenantId_name: { tenantId: tenant, name: `${deviceType} · ${name}` } },
          update: {},
          create: { tenantId: tenant, name: `${deviceType} · ${name}`, deviceType, suggestedPricePyg: price },
        })
      }
      const items = await prisma.serviceItem.findMany({ where: { tenantId: tenant, isActive: true }, orderBy: [{ deviceType: 'asc' }, { name: 'asc' }] })
      return json(items, { status: 201 })
    }
    const name = clean(body.name, 200)
    if (!name) throw new InputError('El nombre del servicio es obligatorio.')
    const deviceType = typeof body.deviceType === 'string' && DEVICE_TYPES.includes(body.deviceType) ? body.deviceType : 'iPhone'
    const price = body.suggestedPricePyg === undefined || body.suggestedPricePyg === '' || body.suggestedPricePyg === null ? 0 : Number(body.suggestedPricePyg)
    if (!safeInt(price)) throw new InputError('Precio sugerido inválido.')
    const created = await prisma.serviceItem.upsert({
      where: { tenantId_name: { tenantId: tenant, name } },
      update: { deviceType, suggestedPricePyg: price, isActive: true },
      create: { tenantId: tenant, name, deviceType, suggestedPricePyg: price },
    })
    return json(created, { status: 201 })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo guardar el servicio.', 400)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['service:manage'])) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'id', 200)
    const existing = await prisma.serviceItem.findFirst({ where: { id, tenantId: tenant } })
    if (!existing) return error('Servicio no encontrado.', 404)
    const price = body.suggestedPricePyg === undefined || body.suggestedPricePyg === '' || body.suggestedPricePyg === null ? undefined : Number(body.suggestedPricePyg)
    if (price !== undefined && !safeInt(price)) throw new InputError('Precio sugerido inválido.')
    const updated = await prisma.serviceItem.update({
      where: { id: existing.id },
      data: {
        ...(body.name === undefined ? {} : { name: clean(body.name, 200) || existing.name }),
        ...(body.deviceType === undefined || !DEVICE_TYPES.includes(String(body.deviceType)) ? {} : { deviceType: String(body.deviceType) }),
        ...(price === undefined ? {} : { suggestedPricePyg: price }),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive === true }),
      },
    })
    return json(updated)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el servicio.', 400)
  }
}
