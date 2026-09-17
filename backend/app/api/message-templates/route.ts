import { randomUUID } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Soporta las dos interfaces históricas de la API:
// - `category` (ORDERS | CUSTOMERS | SERVICE) — componente WhatsAppTemplates.
// - `context` (pedidos | clientes | servicio) — componente PlantillasWhatsApp.
// Se persisten AMBOS campos (espejo): la categoría es canónica y el contexto
// es el alias en minúsculas. La migración conserva ambas columnas.

type Category = 'ORDERS' | 'CUSTOMERS' | 'SERVICE'

const CATEGORIES: Category[] = ['ORDERS', 'CUSTOMERS', 'SERVICE']
const CATEGORY_TO_CONTEXT: Record<Category, string> = { ORDERS: 'pedidos', CUSTOMERS: 'clientes', SERVICE: 'servicio' }
const CONTEXT_TO_CATEGORY: Record<string, Category> = { pedidos: 'ORDERS', clientes: 'CUSTOMERS', servicio: 'SERVICE' }

// Plantillas base por contexto. Se siembran solo si la categoría del tenant
// está vacía: borrar una plantilla no la resucita.
const DEFAULTS: Record<Category, Array<[string, string, string]>> = {
  ORDERS: [
    ['ready_for_pickup', 'Pedido listo para retirar', 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.'],
    ['ready_to_ship', 'Pedido listo para enviar', 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para enviar.'],
    ['arrived_from_depot', 'Pedido llegó a sucursal', 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}. Te avisamos cuando esté listo para retirar.'],
    ['reservation', 'Reserva confirmada', 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.'],
  ],
  CUSTOMERS: [
    ['seguimiento', 'Seguimiento postventa', 'Hola {{cliente}}, ¿cómo estás? Te escribimos de {{empresa}} para saber si todo bien con tu compra.'],
    ['promocion', 'Promoción vigente', 'Hola {{cliente}}, tenemos una promoción pensada para vos en {{empresa}}. Escribinos y te contamos los detalles.'],
    ['recompra', 'Recompra', 'Hola {{cliente}}, ¿te quedó algo pendiente? En {{empresa}} tenemos novedades que pueden interesarte.'],
    ['mayorista', 'Precios mayoristas', 'Hola {{cliente}}, en {{empresa}} podés acceder a precios mayoristas. Si querés, te enviamos la lista actualizada.'],
  ],
  SERVICE: [
    ['equipo_recibido', 'Equipo recibido', 'Hola {{cliente}}, recibimos tu {{equipo}} en {{sucursal}}. Te avisamos cuando tengamos novedades del servicio.'],
    ['diagnostico_listo', 'Diagnóstico listo', 'Hola {{cliente}}, ya tenemos el diagnóstico de tu {{equipo}}. Estado: {{estado}}. Te contactamos para coordinar los próximos pasos.'],
    ['esperando_repuesto', 'Esperando repuesto', 'Hola {{cliente}}, tu {{equipo}} está esperando un repuesto. Te avisamos en cuanto llegue para seguir con la reparación.'],
    ['reparacion_lista', 'Reparación lista', 'Hola {{cliente}}, tu {{equipo}} ya está listo para retirar en {{sucursal}}. Te esperamos.'],
  ],
}

const slugDe = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40)

const nuevaKey = (name: string) => `${slugDe(name) || 'plantilla'}_${randomUUID().replace(/-/g, '').slice(0, 8)}`.slice(0, 64)

const puedeGestionar = (role: string) => ['ADMIN', 'GERENTE'].includes(role)

function categoriaDe(body: Record<string, unknown>, fallback: Category): Category | null {
  if (typeof body.category === 'string' && body.category) {
    const value = body.category.trim().toUpperCase()
    if (CATEGORIES.includes(value as Category)) return value as Category
    return null
  }
  if (typeof body.context === 'string' && body.context) {
    const mapped = CONTEXT_TO_CATEGORY[body.context.trim().toLowerCase()]
    if (mapped) return mapped
    return null
  }
  return fallback
}

function seedData(category: Category) {
  return DEFAULTS[category].map(([key, name, body]) => ({
    tenantKey: key,
    name,
    body,
    category,
    context: CATEGORY_TO_CONTEXT[category],
  }))
}

async function seedCategory(tenantId: string, category: Category) {
  const existing = await prisma.messageTemplate.count({ where: { tenantId, category } })
  if (existing) return
  await prisma.messageTemplate.createMany({
    data: DEFAULTS[category].map(([key, name, body]) => ({ tenantId, key, name, body, category, context: CATEGORY_TO_CONTEXT[category] })),
    skipDuplicates: true,
  })
}

async function marcarPredeterminada(tenantId: string, id: string, category: Category) {
  await prisma.$transaction([
    prisma.messageTemplate.updateMany({ where: { tenantId, category, isDefault: true, id: { not: id } }, data: { isDefault: false } }),
    prisma.messageTemplate.update({ where: { id }, data: { isDefault: true } }),
  ])
}

export async function GET(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const params = new URL(request.url).searchParams
  const requestedCategory = params.get('category')?.trim().toUpperCase() || ''
  const requestedContext = params.get('context')?.trim().toLowerCase() || ''
  const requested = (CATEGORIES.includes(requestedCategory as Category) && requestedCategory) || (CONTEXT_TO_CATEGORY[requestedContext] || '')
  if ((params.get('category') && !requested) || (params.get('context') && !requested)) return error('Categoría de plantilla inválida.')
  const categories = (requested ? [requested] : CATEGORIES) as Category[]
  for (const category of categories) await seedCategory(tenantId, category)
  const templates = await prisma.messageTemplate.findMany({
    where: { tenantId, ...(requested ? { category: requested } : {}) },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  return json(templates)
}

export async function POST(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const duplicateId = typeof body.duplicateOf === 'string' ? body.duplicateOf : typeof body.duplicate === 'string' ? body.duplicate : ''
  if (duplicateId) {
    const original = await prisma.messageTemplate.findFirst({ where: { id: duplicateId, tenantId } })
    if (!original) return error('Plantilla no encontrada.', 404)
    const copy = await prisma.$transaction(async tx => {
      const created = await tx.messageTemplate.create({
        data: {
          tenantId,
          key: nuevaKey(original.name),
          name: `${original.name} (copia)`.slice(0, 120),
          body: original.body,
          category: original.category,
          context: original.context,
          isActive: original.isActive,
          isDefault: false,
        },
      })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'MESSAGE_TEMPLATE_DUPLICATED', entity: 'MessageTemplate', entityId: created.id, metadata: { sourceId: original.id, key: created.key, category: created.category } } })
      return created
    })
    return json(copy, { status: 201 })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const category = categoriaDe(body, 'CUSTOMERS')
  if (!category) return error('Categoría de plantilla inválida.')
  if (!name || name.length > 120) return error('El nombre de la plantilla es obligatorio (hasta 120 caracteres).')
  if (!text || text.length > 1200) return error('El mensaje es obligatorio (hasta 1.200 caracteres).')
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : true
  const isDefault = body.isDefault === true
  const created = await prisma.$transaction(async tx => {
    if (isDefault) {
      await tx.messageTemplate.updateMany({ where: { tenantId, category, isDefault: true }, data: { isDefault: false } })
    }
    const template = await tx.messageTemplate.create({
      data: { tenantId, key: nuevaKey(name), name, body: text, category, context: CATEGORY_TO_CONTEXT[category], isActive, isDefault },
    })
    await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'MESSAGE_TEMPLATE_CREATED', entity: 'MessageTemplate', entityId: template.id, metadata: { key: template.key, category: template.category, isDefault: template.isDefault } } })
    return template
  })
  return json(created, { status: 201 })
}

export async function PATCH(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return error('Plantilla no encontrada.', 404)
  const current = await prisma.messageTemplate.findFirst({ where: { id, tenantId } })
  if (!current) return error('Plantilla no encontrada.', 404)
  const data: { name?: string; body?: string; category?: string; context?: string; isActive?: boolean } = {}
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) return error('El nombre de la plantilla es obligatorio (hasta 120 caracteres).')
    data.name = name
  }
  if (body.body !== undefined) {
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!text || text.length > 1200) return error('El mensaje es obligatorio (hasta 1.200 caracteres).')
    data.body = text
  }
  const nextCategory = (body.category !== undefined || body.context !== undefined)
    ? (categoriaDe(body, current.category) ?? current.category)
    : current.category
  if (body.category !== undefined && !categoriaDe(body, nextCategory)) return error('Categoría de plantilla inválida.')
  if (nextCategory !== current.category) {
    data.category = nextCategory
    data.context = CATEGORY_TO_CONTEXT[nextCategory]
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return error('isActive debe ser booleano.')
    data.isActive = body.isActive
  }
  const isDefault = body.isDefault !== undefined ? body.isDefault === true : current.isDefault
  if (!Object.keys(data).length && !(body.isDefault !== undefined)) return error('No hay cambios para aplicar.')
  const updated = await prisma.$transaction(async tx => {
    if (isDefault) {
      await tx.messageTemplate.updateMany({ where: { tenantId, category: nextCategory, isDefault: true, id: { not: id } }, data: { isDefault: false } })
    }
    await tx.messageTemplate.update({ where: { id }, data: { ...data, isDefault } })
    await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'MESSAGE_TEMPLATE_UPDATED', entity: 'MessageTemplate', entityId: id, metadata: { changed: Object.keys(data), category: nextCategory, isDefault } } })
    return tx.messageTemplate.findFirst({ where: { id, tenantId } })
  })
  return json(updated)
}

export async function DELETE(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return error('Falta la plantilla a eliminar.')
  const deleted = await prisma.$transaction(async tx => {
    const result = await tx.messageTemplate.deleteMany({ where: { id, tenantId } })
    if (result.count) await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'MESSAGE_TEMPLATE_DELETED', entity: 'MessageTemplate', entityId: id, metadata: {} } })
    return result.count
  })
  if (!deleted) return error('Plantilla no encontrada.', 404)
  return json({ ok: true })
}
