import { randomUUID } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Soporta las dos interfaces históricas de la API:
// - `category` (ORDERS | CUSTOMERS | SERVICE | COLLECTIONS) — componente WhatsAppTemplates.
// - `context` (pedidos | clientes | servicio | cobranzas) — componente PlantillasWhatsApp.
// Se persisten AMBOS campos (espejo): la categoría es canónica y el contexto
// es el alias en minúsculas. La migración conserva ambas columnas.

type Category = 'ORDERS' | 'CUSTOMERS' | 'SERVICE' | 'COLLECTIONS'

const CATEGORIES: Category[] = ['ORDERS', 'CUSTOMERS', 'SERVICE', 'COLLECTIONS']
const CATEGORY_TO_CONTEXT: Record<Category, string> = { ORDERS: 'pedidos', CUSTOMERS: 'clientes', SERVICE: 'servicio', COLLECTIONS: 'cobranzas' }
const CONTEXT_TO_CATEGORY: Record<string, Category> = { pedidos: 'ORDERS', clientes: 'CUSTOMERS', servicio: 'SERVICE', cobranzas: 'COLLECTIONS' }

// Plantillas base por contexto, listas para usar (tono profesional y emojis
// medidos). La siembra es idempotente: agrega solo las que faltan por clave, así
// que una tienda existente recibe las nuevas sin duplicar ni resucitar las
// borradas.
const DEFAULTS: Record<Category, Array<[string, string, string]>> = {
  ORDERS: [
    ['recibido', 'Pedido recibido', '¡Hola {{cliente}}! 🧾 Recibimos tu pedido {{pedido}} por {{total}}. Te avisamos apenas avance. ¡Gracias por tu compra!'],
    ['ready_for_pickup', 'Pedido listo para retirar', '¡Hola {{cliente}}! 👋 Tu pedido {{pedido}} ya está listo para retirar en {{sucursal}}. Te esperamos. ¡Gracias por tu compra! — {{empresa}}'],
    ['ready_to_ship', 'Pedido listo para enviar', '¡Hola {{cliente}}! 📦 Tu pedido {{pedido}} ya está preparado y sale para envío. Te paso el seguimiento apenas esté en camino.'],
    ['arrived_from_depot', 'Pedido llegó a sucursal', '¡Hola {{cliente}}! 🚚 Tu pedido {{pedido}} ya llegó a {{sucursal}}. Lo estamos revisando y te avisamos cuando puedas retirarlo.'],
    ['en_camino', 'Pedido en camino', '¡Hola {{cliente}}! 🚚 Tu pedido {{pedido}} salió y está en camino. En breve lo recibís.'],
    ['reservation', 'Reserva confirmada', '¡Hola {{cliente}}! ⏳ Te reservamos el pedido {{pedido}} hasta {{reservation_until}}. Si necesitás más tiempo, avisanos y lo extendemos.'],
    ['saldo_pendiente', 'Saldo pendiente del pedido', '¡Hola {{cliente}}! 👋 Te recordamos que el pedido {{pedido}} tiene un saldo pendiente de {{saldo_pendiente}}. Podés pasar por {{sucursal}} o coordinar el pago por acá. ¡Gracias!'],
    ['pago_pendiente', 'Pago pendiente', '¡Hola {{cliente}}! 👋 Tu pedido {{pedido}} tiene un pago pendiente de {{saldo_pendiente}}. Podés pasar por {{sucursal}} o coordinarlo por acá.'],
    ['entregado', 'Pedido entregado', '¡Hola {{cliente}}! ✅ Tu pedido {{pedido}} quedó entregado. Gracias por elegirnos.'],
    ['envio_seguimiento', 'Seguimiento de envío', '¡Hola {{cliente}}! 📍 Tu pedido {{pedido}} ya está en camino. Podés seguirlo acá: {{seguimiento}}'],
  ],
  CUSTOMERS: [
    ['seguimiento', 'Seguimiento postventa', '¡Hola {{nombre}}! 😊 Te escribimos de {{empresa}} para saber cómo te fue con tu compra. Si necesitás algo, estamos por acá.'],
    ['promocion', 'Promoción vigente', '¡Hola {{nombre}}! 🎉 Tenemos una promo pensada para vos en {{empresa}}: pasá por {{sucursal}} o respondé este mensaje y te contamos.'],
    ['recompra', 'Recompra', '¡Hola {{nombre}}! 📱 ¿Pensando en cambiar el equipo? En {{empresa}} tenemos novedades que te pueden interesar. Te esperamos.'],
    ['mayorista', 'Precios mayoristas', '¡Hola {{nombre}}! 🛒 En {{empresa}} accedés a precios mayoristas. Si querés, te enviamos la lista actualizada.'],
    ['agradecimiento', 'Agradecimiento por la compra', '¡Gracias por tu compra, {{nombre}}! 🙌 Cualquier consulta sobre tu equipo, escribinos: estamos para ayudarte. — {{empresa}}'],
    ['saldo_cliente', 'Recordatorio de saldo', '¡Hola {{nombre}}! 👋 Te recordamos que tu saldo pendiente es {{saldo_pendiente}}. Si ya lo abonaste, ignorá este mensaje. ¡Gracias por tu confianza!'],
  ],
  SERVICE: [
    ['equipo_recibido', 'Equipo recibido', '¡Hola {{cliente}}! 🛠️ Recibimos tu {{equipo}} en {{sucursal}}. Ya empieza la revisión y te avisamos con el diagnóstico.'],
    ['diagnostico_listo', 'Diagnóstico listo', '¡Hola {{cliente}}! 🔍 Ya tenemos el diagnóstico de tu {{equipo}}: {{estado}}. Te escribimos para coordinar los próximos pasos.'],
    ['esperando_repuesto', 'Esperando repuesto', '¡Hola {{cliente}}! ⏳ Tu {{equipo}} está esperando un repuesto. Apenas llegue te avisamos para continuar con la reparación.'],
    ['reparado', 'Equipo reparado', '¡Hola {{cliente}}! ✅ Tu {{equipo}} ya está reparado. Podés retirarlo en {{sucursal}} con el comprobante.'],
    ['reparacion_lista', 'Reparación lista', '¡Hola {{cliente}}! ✅ Tu {{equipo}} ya está listo para retirar en {{sucursal}}. Te esperamos con el comprobante.'],
    ['presupuesto', 'Presupuesto del servicio', '¡Hola {{cliente}}! 🧾 El presupuesto de tu {{equipo}} es {{total}}. Si lo aprobás, arrancamos con la reparación.'],
  ],
  COLLECTIONS: [
    ['cuota_por_vencer', 'Cuota por vencer', '¡Hola {{cliente}}! 👋 Te recordamos que la cuota del pedido {{pedido}} vence el {{vencimiento}} por {{saldo_pendiente}}. Podés coordinar el pago con nosotros. ¡Gracias! — {{empresa}}'],
    ['cuota_vencida', 'Cuota vencida', '¡Hola {{cliente}}! 👋 La cuota del pedido {{pedido}} venció el {{vencimiento}} y tiene un saldo de {{saldo_pendiente}} ({{dias_atraso}} día(s) de atraso). Podés coordinar el pago con nosotros. ¡Gracias! — {{empresa}}'],
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
  // Sin corte por "ya existe": createMany + skipDuplicates es idempotente y
  // agrega solo las claves nuevas.
  await prisma.messageTemplate.createMany({
    data: DEFAULTS[category].map(([key, name, body]) => ({ tenantId, key, name, body, category, context: CATEGORY_TO_CONTEXT[category] })),
    skipDuplicates: true,
  })
  // Espejo context ↔ category: `skipDuplicates` no corrige las filas sembradas
  // por versiones viejas, que quedaron con el contexto por defecto 'clientes'
  // (issue #34). Se alinean al listar sin tocar la clave: el aviso por estado
  // sigue encontrando la plantilla por (tenantId, key).
  await prisma.messageTemplate.updateMany({
    where: { tenantId, category, context: { not: CATEGORY_TO_CONTEXT[category] } },
    data: { context: CATEGORY_TO_CONTEXT[category] },
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
  const nextCategory: Category = (body.category !== undefined || body.context !== undefined)
    ? (categoriaDe(body, current.category as Category) ?? (current.category as Category))
    : (current.category as Category)
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
