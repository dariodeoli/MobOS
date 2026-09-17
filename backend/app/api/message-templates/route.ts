import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const CONTEXTOS = ['clientes', 'pedidos', 'servicio'] as const

const defaults = [
  ['ready_for_pickup', 'Pedido listo para retirar', 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.'],
  ['arrived_from_depot', 'Pedido llegó a sucursal', 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}. Te avisamos cuando esté listo para retirar.'],
  ['reservation', 'Reserva confirmada', 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.'],
]
const limpio = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : ''
const contextoValido = (value: unknown) => CONTEXTOS.includes(value as (typeof CONTEXTOS)[number]) ? (value as string) : null
const puedeGestionar = (role: string) => ['ADMIN', 'GERENTE'].includes(role)

export async function GET(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const contexto = new URL(request.url).searchParams.get('context')
  await prisma.$transaction(defaults.map(([key, name, body]) => prisma.messageTemplate.upsert({ where: { tenantId_key: { tenantId, key } }, create: { tenantId, key, name, body, context: 'pedidos' }, update: {} })))
  const filtro = contextoValido(contexto)
  return json(await prisma.messageTemplate.findMany({ where: { tenantId, ...(filtro ? { context: filtro } : {}) }, orderBy: [{ context: 'asc' }, { name: 'asc' }] }))
}

export async function POST(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json()
  const tenantId = session.user.tenantId
  if (body.duplicate) {
    const origen = await prisma.messageTemplate.findFirst({ where: { id: String(body.duplicate), tenantId } })
    if (!origen) return error('Plantilla no encontrada.', 404)
    const copia = await prisma.messageTemplate.create({ data: { tenantId, key: `${origen.key}-copia-${Date.now().toString(36)}`, name: `${origen.name} (copia)`.slice(0, 120), body: origen.body, context: origen.context } })
    return json(copia, { status: 201 })
  }
  const name = limpio(body.name, 120)
  const texto = limpio(body.body, 1200)
  const context = contextoValido(body.context) || 'clientes'
  if (!name || !texto) return error('Nombre y mensaje son obligatorios (máximo 1.200 caracteres).')
  const creada = await prisma.messageTemplate.create({ data: { tenantId, key: `plantilla-${Date.now().toString(36)}`, name, body: texto, context, isDefault: body.isDefault === true } })
  if (creada.isDefault) await marcarPredeterminada(tenantId, creada.id, context)
  return json(creada, { status: 201 })
}

async function marcarPredeterminada(tenantId: string, id: string, context: string) {
  await prisma.$transaction([
    prisma.messageTemplate.updateMany({ where: { tenantId, context, isDefault: true, id: { not: id } }, data: { isDefault: false } }),
    prisma.messageTemplate.update({ where: { id }, data: { isDefault: true } }),
  ])
}

export async function PATCH(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return error('Plantilla obligatoria.')
  const actual = await prisma.messageTemplate.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!actual) return error('Plantilla no encontrada.', 404)
  const context = contextoValido(body.context) || actual.context
  const data: Record<string, unknown> = {
    ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim().slice(0, 120) } : {}),
    ...(typeof body.body === 'string' && body.body.trim() ? { body: body.body.trim().slice(0, 1200) } : {}),
    ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
    ...(context === actual.context ? {} : { context }),
  }
  if (body.isDefault === true) {
    await marcarPredeterminada(session.user.tenantId, id, context)
    delete data.isDefault
  }
  const updated = await prisma.messageTemplate.updateMany({ where: { id, tenantId: session.user.tenantId }, data })
  if (!updated.count) return error('Plantilla no encontrada.', 404)
  return json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const id = new URL(request.url).searchParams.get('id') || ''
  const borrada = await prisma.messageTemplate.deleteMany({ where: { id, tenantId: session.user.tenantId } })
  if (!borrada.count) return error('Plantilla no encontrada.', 404)
  return json({ ok: true })
}
