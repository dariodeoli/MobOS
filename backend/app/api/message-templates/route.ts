import { randomUUID } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { tenantModuleEnabled } from '../../../lib/tenant-module-access'
import {
  CATEGORIES, CATEGORY_TO_CONTEXT, CONTEXT_TO_CATEGORY, EMAIL_PREFIX, defaultKeys, deletedKeysFrom,
  isCampaignKey, isEmailKey, planSeed, withDeletedKey,
  type Category, type Channel,
} from '../../../lib/message-templates'

// Soporta las dos interfaces históricas de la API:
// - `category` (ORDERS | CUSTOMERS | SERVICE | COLLECTIONS) — componente WhatsAppTemplates.
// - `context` (pedidos | clientes | servicio | cobranzas) — componente PlantillasWhatsApp.
// Se persisten AMBOS campos (espejo): la categoría es canónica y el contexto
// es el alias en minúsculas. La migración conserva ambas columnas.
//
// Las plantillas listas (WhatsApp + correo) son del núcleo: solo las de
// campañas (promoción, recompra, mayorista) dependen del módulo «mensajes».
// `channel` = whatsapp (por defecto) | email | all. Las de correo llevan la
// clave `email.<evento>` y un asunto (`subject`).

async function campanasActivas(tenantId: string) {
  return tenantModuleEnabled(tenantId, 'mensajes')
}
const campanasApagadas = () => error('Las plantillas de campañas necesitan el módulo de mensajes activo.', 403)

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

async function seedCategory(tenantId: string, category: Category, deleted: string[]) {
  // Sin corte por "ya existe": createMany + skipDuplicates es idempotente y
  // agrega solo las claves nuevas. Las que la empresa borró no se reviven.
  const existing = await prisma.messageTemplate.findMany({ where: { tenantId, category }, select: { key: true } })
  const faltan = planSeed(category, existing.map(item => item.key), deleted)
  if (faltan.length) {
    await prisma.messageTemplate.createMany({
      data: faltan.map(item => ({ tenantId, key: item.key, name: item.name, body: item.body, subject: item.subject ?? null, channel: item.channel, category, context: CATEGORY_TO_CONTEXT[category] })),
      skipDuplicates: true,
    })
  }
  // Espejo context ↔ category: `skipDuplicates` no corrige las filas sembradas
  // por versiones viejas, que quedaron con el contexto por defecto 'clientes'
  // (issue #34). Se alinean al listar sin tocar la clave: el aviso por estado
  // sigue encontrando la plantilla por (tenantId, key).
  await prisma.messageTemplate.updateMany({
    where: { tenantId, category, context: { not: CATEGORY_TO_CONTEXT[category] } },
    data: { context: CATEGORY_TO_CONTEXT[category] },
  })
  // Las de correo sembradas antes de la columna `channel` ya nacen con 'email'.
  await prisma.messageTemplate.updateMany({ where: { tenantId, key: { startsWith: EMAIL_PREFIX }, channel: { not: 'email' } }, data: { channel: 'email' } })
}

function canalPedido(value: unknown): Channel | 'all' | null {
  if (value === null || value === undefined || value === '') return 'whatsapp'
  const text = String(value).trim().toLowerCase()
  return text === 'all' || text === 'whatsapp' || text === 'email' ? text : null
}

function asuntoDe(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return 'invalid'
  const text = value.trim()
  return text.length > 200 ? 'invalid' : text || null
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
  const channel = canalPedido(params.get('channel'))
  if (!channel) return error('Canal de plantilla inválido.')
  const categories = (requested ? [requested] : CATEGORIES) as Category[]
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  const deleted = deletedKeysFrom(tenant?.settings)
  for (const category of categories) await seedCategory(tenantId, category, deleted)
  const campanas = await campanasActivas(tenantId)
  const templates = await prisma.messageTemplate.findMany({
    where: { tenantId, ...(requested ? { category: requested } : {}), ...(channel === 'all' ? {} : { channel }) },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  return json(campanas ? templates : templates.filter(item => !isCampaignKey(item.key)))
}

export async function POST(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const campanas = await campanasActivas(tenantId)
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const duplicateId = typeof body.duplicateOf === 'string' ? body.duplicateOf : typeof body.duplicate === 'string' ? body.duplicate : ''
  if (duplicateId) {
    const original = await prisma.messageTemplate.findFirst({ where: { id: duplicateId, tenantId } })
    if (!original) return error('Plantilla no encontrada.', 404)
    if (!campanas && isCampaignKey(original.key)) return campanasApagadas()
    const copy = await prisma.$transaction(async tx => {
      const created = await tx.messageTemplate.create({
        data: {
          tenantId,
          key: `${isEmailKey(original.key) ? EMAIL_PREFIX : ''}${nuevaKey(original.name)}`.slice(0, 64),
          name: `${original.name} (copia)`.slice(0, 120),
          body: original.body,
          subject: original.subject,
          channel: original.channel,
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
  const channel = canalPedido(body.channel)
  if (!channel || channel === 'all') return error('Canal de plantilla inválido.')
  const subject = asuntoDe(body.subject)
  if (subject === 'invalid') return error('El asunto admite hasta 200 caracteres.')
  if (!name || name.length > 120) return error('El nombre de la plantilla es obligatorio (hasta 120 caracteres).')
  if (!text || text.length > 1200) return error('El mensaje es obligatorio (hasta 1.200 caracteres).')
  if (channel === 'email' && !subject) return error('El asunto del correo es obligatorio.')
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : true
  const isDefault = body.isDefault === true
  const created = await prisma.$transaction(async tx => {
    if (isDefault) {
      await tx.messageTemplate.updateMany({ where: { tenantId, category, channel, isDefault: true }, data: { isDefault: false } })
    }
    const key = `${channel === 'email' ? EMAIL_PREFIX : ''}${nuevaKey(name)}`.slice(0, 64)
    const template = await tx.messageTemplate.create({
      data: { tenantId, key, name, body: text, subject: channel === 'email' ? subject : null, channel, category, context: CATEGORY_TO_CONTEXT[category], isActive, isDefault },
    })
    await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'MESSAGE_TEMPLATE_CREATED', entity: 'MessageTemplate', entityId: template.id, metadata: { key: template.key, category: template.category, channel, isDefault: template.isDefault } } })
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
  if (isCampaignKey(current.key) && !await campanasActivas(tenantId)) return campanasApagadas()
  const data: { name?: string; body?: string; subject?: string | null; category?: string; context?: string; isActive?: boolean } = {}
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
  if (body.subject !== undefined) {
    if (current.channel !== 'email') return error('Solo las plantillas de correo llevan asunto.')
    const subject = asuntoDe(body.subject)
    if (subject === 'invalid' || !subject) return error('El asunto del correo es obligatorio (hasta 200 caracteres).')
    data.subject = subject
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
      await tx.messageTemplate.updateMany({ where: { tenantId, category: nextCategory, channel: current.channel, isDefault: true, id: { not: id } }, data: { isDefault: false } })
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
  const current = await prisma.messageTemplate.findFirst({ where: { id, tenantId }, select: { key: true } })
  if (!current) return error('Plantilla no encontrada.', 404)
  if (isCampaignKey(current.key) && !await campanasActivas(tenantId)) return campanasApagadas()
  const deleted = await prisma.$transaction(async tx => {
    const result = await tx.messageTemplate.deleteMany({ where: { id, tenantId } })
    if (result.count) {
      // Una plantilla lista que la empresa borra no se vuelve a sembrar.
      if (defaultKeys().has(current.key)) {
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } })
        await tx.tenant.update({ where: { id: tenantId }, data: { settings: withDeletedKey(tenant.settings, current.key) as never } })
      }
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'MESSAGE_TEMPLATE_DELETED', entity: 'MessageTemplate', entityId: id, metadata: { key: current.key } } })
    }
    return result.count
  })
  if (!deleted) return error('Plantilla no encontrada.', 404)
  return json({ ok: true })
}
