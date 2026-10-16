import type { Prisma, PrismaClient } from '@prisma/client'
import { InputError } from './payment-input'
import { builtinTemplates, PRINT_TEMPLATE_KINDS, templateDefinition, templateInput, templateKind, templateName, templateRevision } from './print-templates'

export type TemplateContext = { tenantId: string; userId: string; role: string; branchId: string | null }
const notFound = () => new InputError('Plantilla no encontrada.', 404)
function admin(ctx: TemplateContext) { if (ctx.role !== 'ADMIN') throw new InputError('No autorizado.', 403) }
function shape(t: { id: string; kind: string; name: string; revision: number; definition: unknown; createdAt: Date; updatedAt: Date }) {
  return { id: t.id, kind: t.kind, name: t.name, revision: t.revision, definition: t.definition, createdAt: t.createdAt, updatedAt: t.updatedAt }
}
async function scope(db: Prisma.TransactionClient | PrismaClient, ctx: TemplateContext, value: unknown) {
  const branchId = value === undefined ? ctx.branchId : value === null || value === '' ? null : value
  if (branchId !== null && (typeof branchId !== 'string' || branchId.length > 200)) throw new InputError('Sucursal inválida.')
  if (ctx.branchId && branchId !== ctx.branchId) throw new InputError('Sucursal fuera del alcance de la sesión.', 403)
  if (branchId && !await db.branch.findFirst({ where: { id: branchId, tenantId: ctx.tenantId, isActive: true }, select: { id: true } })) throw new InputError('Sucursal no encontrada.', 404)
  return branchId as string | null
}
function audit(tx: Prisma.TransactionClient, ctx: TemplateContext, action: string, id: string, metadata: Prisma.InputJsonObject) {
  return tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, action, entity: 'PrintTemplate', entityId: id, metadata } })
}
async function lock(tx: Prisma.TransactionClient, ctx: TemplateContext) {
  // Serialize configuration for this company, including default races/archival.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`print-templates:${ctx.tenantId}`}, 0))::text`
}
export async function listTemplates(db: PrismaClient, ctx: TemplateContext, kindValue?: unknown) {
  const kind = kindValue ? templateKind(kindValue) : undefined
  const rows = await db.printTemplate.findMany({ where: { tenantId: ctx.tenantId, archivedAt: null, ...(kind ? { kind } : {}) }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }], take: 200 })
  return { templates: rows.map(shape), presets: builtinTemplates().filter(p => !kind || p.kind === kind) }
}
export async function readTemplate(db: PrismaClient, ctx: TemplateContext, id: string) {
  const row = await db.printTemplate.findFirst({ where: { id, tenantId: ctx.tenantId, archivedAt: null } })
  if (!row) throw notFound()
  return shape(row)
}
export async function createTemplate(db: PrismaClient, ctx: TemplateContext, body: unknown) {
  admin(ctx)
  const input = templateInput(body); const kind = templateKind(input.kind)
  const name = templateName(input.name); const definition = templateDefinition(kind, input.definition)
  return db.$transaction(async tx => {
    await lock(tx, ctx)
    if (await tx.printTemplate.count({ where: { tenantId: ctx.tenantId, archivedAt: null } }) >= 200) throw new InputError('Máximo de 200 plantillas activas por empresa.', 409)
    const row = await tx.printTemplate.create({ data: { tenantId: ctx.tenantId, kind, name, definition, createdByUserId: ctx.userId, updatedByUserId: ctx.userId } })
    await audit(tx, ctx, 'PRINT_TEMPLATE_CREATED', row.id, { kind, revision: row.revision })
    return shape(row)
  })
}
export async function changeTemplate(db: PrismaClient, ctx: TemplateContext, id: string, operation: 'patch' | 'delete' | 'action', body: unknown) {
  admin(ctx)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Datos inválidos.')
  const input = body as Record<string, unknown>
  const keys = operation === 'patch' ? ['revision', 'name', 'definition'] : operation === 'delete' ? ['revision'] : ['revision', 'action', 'name']
  if (Object.keys(input).some(key => !keys.includes(key))) throw new InputError('Campo no permitido.')
  const revision = templateRevision(input.revision)
  if (operation === 'action' && !['duplicate', 'restore'].includes(String(input.action))) throw new InputError('Acción inválida.')
  if (input.name !== undefined && operation === 'action' && input.action !== 'duplicate') throw new InputError('Restablecer no cambia el nombre.')
  return db.$transaction(async tx => {
    await lock(tx, ctx)
    const current = await tx.printTemplate.findFirst({ where: { id, tenantId: ctx.tenantId, archivedAt: null } })
    if (!current) throw notFound()
    if (current.revision !== revision) throw new InputError('La plantilla cambió. Actualizá antes de guardar.', 409)
    const kind = templateKind(current.kind)
    if (operation === 'delete') {
      await tx.printTemplateDefault.deleteMany({ where: { tenantId: ctx.tenantId, templateId: id } })
      await tx.printTemplate.update({ where: { id }, data: { archivedAt: new Date(), revision: { increment: 1 }, updatedByUserId: ctx.userId } })
      await audit(tx, ctx, 'PRINT_TEMPLATE_ARCHIVED', id, { kind, revision: revision + 1 })
      return { deleted: true, id }
    }
    if (operation === 'action' && input.action === 'duplicate') {
      if (await tx.printTemplate.count({ where: { tenantId: ctx.tenantId, archivedAt: null } }) >= 200) throw new InputError('Máximo de 200 plantillas activas por empresa.', 409)
      const row = await tx.printTemplate.create({ data: { tenantId: ctx.tenantId, kind, name: templateName(input.name ?? `${current.name.slice(0, 70)} copia`), definition: templateDefinition(kind, current.definition), createdByUserId: ctx.userId, updatedByUserId: ctx.userId } })
      await audit(tx, ctx, 'PRINT_TEMPLATE_DUPLICATED', row.id, { kind, sourceId: id, revision: row.revision })
      return shape(row)
    }
    const definition = operation === 'action' ? builtinTemplates().find(p => p.kind === kind)!.definition : input.definition === undefined ? templateDefinition(kind, current.definition) : templateDefinition(kind, input.definition)
    const name = input.name === undefined ? current.name : templateName(input.name)
    const row = await tx.printTemplate.update({ where: { id }, data: { name, definition, revision: { increment: 1 }, updatedByUserId: ctx.userId } })
    await audit(tx, ctx, operation === 'action' ? 'PRINT_TEMPLATE_RESTORED' : 'PRINT_TEMPLATE_UPDATED', id, { kind, previousRevision: revision, revision: row.revision, changed: [ ...(input.name !== undefined ? ['name'] : []), ...(input.definition !== undefined || operation === 'action' ? ['definition'] : []) ] })
    return shape(row)
  })
}
export async function getTemplateDefaults(db: PrismaClient, ctx: TemplateContext, branchValue?: unknown, kindValue?: unknown) {
  const branchId = await scope(db, ctx, branchValue)
  const kinds = kindValue ? [templateKind(kindValue)] : [...PRINT_TEMPLATE_KINDS]
  const rows = await db.printTemplateDefault.findMany({ where: { tenantId: ctx.tenantId, kind: { in: kinds }, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])], template: { tenantId: ctx.tenantId, archivedAt: null } } })
  const defaults = rows.map(row => ({ kind: row.kind, branchId: row.branchId, templateId: row.templateId }))
  const effective = Object.fromEntries(kinds.map(kind => {
    const branch = branchId ? defaults.find(d => d.kind === kind && d.branchId === branchId) : null
    const company = defaults.find(d => d.kind === kind && d.branchId === null)
    return [kind, { templateId: branch?.templateId ?? company?.templateId ?? null, source: branch ? 'branch' : company ? 'company' : 'builtin' }]
  }))
  return { defaults, effective }
}
export async function setTemplateDefault(db: PrismaClient, ctx: TemplateContext, body: unknown) {
  admin(ctx)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Datos inválidos.')
  const input = body as Record<string, unknown>
  if (Object.keys(input).some(k => !['kind', 'branchId', 'templateId'].includes(k)) || input.branchId === undefined) throw new InputError('Tipo, sucursal explícita y plantilla requeridos.')
  const kind = templateKind(input.kind)
  if (input.branchId !== null && (typeof input.branchId !== 'string' || !input.branchId)) throw new InputError('Sucursal explícita inválida.')
  if (input.templateId !== null && (typeof input.templateId !== 'string' || !input.templateId || input.templateId.length > 200)) throw new InputError('Plantilla inválida.')
  return db.$transaction(async tx => {
    await lock(tx, ctx)
    const branchId = await scope(tx, ctx, input.branchId)
    const scopeKey = branchId ? `branch:${branchId}` : 'company'
    if (input.templateId !== null) {
      const template = await tx.printTemplate.findFirst({ where: { id: input.templateId as string, tenantId: ctx.tenantId, kind, archivedAt: null } })
      if (!template) throw notFound()
      await tx.printTemplateDefault.upsert({ where: { tenantId_scopeKey_kind: { tenantId: ctx.tenantId, scopeKey, kind } }, create: { tenantId: ctx.tenantId, branchId, scopeKey, kind, templateId: template.id, updatedByUserId: ctx.userId }, update: { templateId: template.id, updatedByUserId: ctx.userId } })
    } else await tx.printTemplateDefault.deleteMany({ where: { tenantId: ctx.tenantId, scopeKey, kind } })
    await audit(tx, ctx, 'PRINT_TEMPLATE_DEFAULT_CHANGED', String(input.templateId ?? scopeKey), { kind, branchId, templateId: input.templateId as string | null })
    return { kind, branchId, templateId: input.templateId }
  })
}
