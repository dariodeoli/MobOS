import type { Prisma, PrismaClient } from '@prisma/client'
import { hasPermission, type AuthUser } from './auth'
import { customerIdentityInput, officialNameInput, serializeCustomer } from './customer-identity'
import { prisma } from './prisma'
import { addressesInput, leerPorcentajeSeguro } from '../app/api/customers/_lib'
import { LIMITE_MONTO_GENERAL } from './montos'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * The small, shared customer write surface used by integrations (including
 * MCP). The HTTP routes keep their historical, wider contract; integrations
 * must use this allow-listed input so they cannot write operational fields.
 */
export type CustomerServiceActor = Pick<AuthUser, 'id' | 'tenantId' | 'role' | 'permissions'>

export type CustomerServiceInput = Record<string, unknown> & {
  name?: unknown
  firstName?: unknown
  secondName?: unknown
  document?: unknown
  phone?: unknown
  countryCode?: unknown
  email?: unknown
  addresses?: unknown
}

export class CustomerServiceError extends Error {
  constructor(public readonly code: 'forbidden' | 'conflict' | 'invalid' | 'not_found', message: string) {
    super(message)
  }
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const nullableText = (value: unknown, max: number) => text(value, max) || null

function assertActor(actor: CustomerServiceActor) {
  if (!actor.tenantId || !actor.id || !hasPermission(actor, 'customers:manage')) {
    throw new CustomerServiceError('forbidden', 'El usuario no puede gestionar clientes.')
  }
}

function privileged(actor: CustomerServiceActor) {
  return actor.role === 'ADMIN' || actor.role === 'GERENTE' || actor.permissions.includes('*')
}

function identityFields(input: CustomerServiceInput, partial = false) {
  const identity = customerIdentityInput(input)
  const firstName = nullableText(input.firstName, 120)
  const secondName = nullableText(input.secondName, 120)
  const fallbackName = nullableText(input.name, 200)
  const name = [firstName, secondName].filter(Boolean).join(' ') || fallbackName
  if (!partial && !name) throw new CustomerServiceError('invalid', 'El nombre es obligatorio.')
  const fields: Record<string, unknown> = {
    ...identity,
    ...(name ? { name } : {}),
    ...(Object.hasOwn(input, 'firstName') ? { firstName } : {}),
    ...(Object.hasOwn(input, 'secondName') ? { secondName } : {}),
    ...(Object.hasOwn(input, 'document') ? { document: nullableText(input.document, 100) } : {}),
    ...(Object.hasOwn(input, 'phone') ? { phone: nullableText(input.phone, 100) } : {}),
    ...(Object.hasOwn(input, 'countryCode') ? { countryCode: typeof input.countryCode === 'string' && /^\+\d{1,4}$/.test(input.countryCode) ? input.countryCode : '+595' } : {}),
    ...(Object.hasOwn(input, 'email') ? { email: nullableText(input.email, 200) } : {}),
    ...(Object.hasOwn(input, 'externalId') ? { externalId: nullableText(input.externalId, 100) } : {}),
  }
  return fields
}

function optionalFields(input: CustomerServiceInput, actor: CustomerServiceActor, options: { allowUnprivilegedCommercial?: boolean } = {}) {
  const fields: Record<string, unknown> = {
    ...(input.notes !== undefined ? { notes: nullableText(input.notes, 2000) } : {}),
    ...(input.publicNote !== undefined ? { publicNote: nullableText(input.publicNote, 2000) } : {}),
    ...(input.tags !== undefined ? { tags: Array.isArray(input.tags) ? input.tags.map(tag => text(tag, 50)).filter(Boolean).slice(0, 20) : [] } : {}),
    ...(input.acceptsEmailMarketing !== undefined ? { acceptsEmailMarketing: input.acceptsEmailMarketing === true } : {}),
    ...(input.acceptsSmsMarketing !== undefined ? { acceptsSmsMarketing: input.acceptsSmsMarketing === true } : {}),
    ...(input.acceptsWhatsappMarketing !== undefined ? { acceptsWhatsappMarketing: input.acceptsWhatsappMarketing === true } : {}),
    ...(input.taxExempt !== undefined ? { taxExempt: input.taxExempt === true } : {}),
    ...(input.billingName !== undefined ? { billingName: input.billingName === null ? null : officialNameInput(input.billingName) } : {}),
    ...(input.billingDocument !== undefined ? { billingDocument: nullableText(input.billingDocument, 100) } : {}),
    ...(input.insuranceEnabled !== undefined ? { insuranceEnabled: input.insuranceEnabled === true } : {}),
  }
  if (Object.keys(fields).some(key => ['notes', 'publicNote', 'tags'].includes(key)) && !hasPermission(actor, 'customers:manage')) {
    throw new CustomerServiceError('forbidden', 'El usuario no puede gestionar clientes.')
  }
  if (input.pricingTier !== undefined || input.creditLimitPyg !== undefined || input.creditDays !== undefined || input.creditTolerancePct !== undefined || input.creditTermMode !== undefined || input.creditDayOfMonth !== undefined || input.creditInstallments !== undefined) {
    if (!privileged(actor) && !options.allowUnprivilegedCommercial) throw new CustomerServiceError('forbidden', 'Solo administración o gerencia pueden cambiar crédito y tipo de cliente.')
    if (input.pricingTier !== undefined) fields.pricingTier = input.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL'
    if (input.creditLimitPyg !== undefined) {
      const value = input.creditLimitPyg === null || input.creditLimitPyg === '' ? null : Number(input.creditLimitPyg)
      if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > LIMITE_MONTO_GENERAL)) throw new CustomerServiceError('invalid', 'Límite de crédito inválido.')
      fields.creditLimitPyg = value
    }
    if (input.creditDays !== undefined) {
      const value = input.creditDays === null || input.creditDays === '' ? null : Number(input.creditDays)
      if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 365)) throw new CustomerServiceError('invalid', 'Plazo de crédito inválido.')
      fields.creditDays = value
    }
    // Plazo y tolerancia propios de la ficha; vacío = vale el del módulo «Venta a crédito».
    const empty = (value: unknown) => value === null || value === '' ? null : value
    if (input.creditTolerancePct !== undefined) {
      const value = empty(input.creditTolerancePct) === null ? null : Number(input.creditTolerancePct)
      if (value !== null && ![0, 10, 20, 30].includes(value)) throw new CustomerServiceError('invalid', 'La tolerancia debe ser 0, 10, 20 o 30 por ciento.')
      fields.creditTolerancePct = value
    }
    if (input.creditTermMode !== undefined) {
      const value = empty(input.creditTermMode)
      if (value !== null && !['DIAS', 'DIA_MES', 'CUOTAS'].includes(String(value))) throw new CustomerServiceError('invalid', 'La modalidad de plazo debe ser días, día del mes o cuotas.')
      fields.creditTermMode = value === null ? null : String(value)
    }
    if (input.creditDayOfMonth !== undefined) {
      const value = empty(input.creditDayOfMonth) === null ? null : Number(input.creditDayOfMonth)
      if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > 31)) throw new CustomerServiceError('invalid', 'El día del mes debe estar entre 1 y 31.')
      fields.creditDayOfMonth = value
    }
    if (input.creditInstallments !== undefined) {
      const value = empty(input.creditInstallments) === null ? null : Number(input.creditInstallments)
      if (value !== null && (!Number.isSafeInteger(value) || value < 2 || value > 24)) throw new CustomerServiceError('invalid', 'La cantidad de cuotas debe estar entre 2 y 24.')
      fields.creditInstallments = value
    }
  }
  if (input.insuranceEnabled !== undefined || input.insuranceRatePct !== undefined) {
    if (!privileged(actor)) throw new CustomerServiceError('forbidden', 'Solo administración o gerencia pueden configurar el seguro.')
    if (input.insuranceEnabled !== undefined && typeof input.insuranceEnabled !== 'boolean') throw new CustomerServiceError('invalid', 'El seguro debe estar activo o inactivo.')
    const rate = leerPorcentajeSeguro(input.insuranceRatePct)
    if (rate === 'invalido') throw new CustomerServiceError('invalid', 'El seguro debe ser un porcentaje entre 0 y 100.')
    if (rate !== undefined) fields.insuranceRatePct = rate
  }
  if (input.priceListId !== undefined) fields.priceListId = input.priceListId === null || input.priceListId === '' ? null : text(input.priceListId, 128)
  if (input.blocked !== undefined || input.blockedReason !== undefined) {
    if (!privileged(actor)) throw new CustomerServiceError('forbidden', 'Solo administración o gerencia pueden bloquear clientes.')
    if (input.blocked !== undefined && typeof input.blocked !== 'boolean') throw new CustomerServiceError('invalid', 'blocked debe ser verdadero o falso.')
    const blocked = input.blocked === true
    const reason = blocked ? nullableText(input.blockedReason, 300) : null
    if (blocked && !reason) throw new CustomerServiceError('invalid', 'Indicá el motivo del bloqueo.')
    fields.blocked = blocked
    fields.blockedReason = reason
    fields.blockedAt = blocked ? new Date() : null
  }
  return fields
}

const customerInclude = { addresses: { orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }] } }

async function duplicate(db: Db, tenantId: string, fields: ReturnType<typeof identityFields>, excludeId?: string) {
  const values = [fields.document, fields.phone, fields.externalId].filter(Boolean)
  if (!values.length) return null
  return db.customer.findFirst({
    where: { tenantId, ...(excludeId ? { id: { not: excludeId } } : {}), OR: [{ document: fields.document ?? undefined }, { phone: fields.phone ?? undefined }, { externalId: fields.externalId ?? undefined }].filter(item => Object.values(item)[0] !== undefined) },
    select: { id: true },
  })
}

export async function createCustomer(db: Db, actor: CustomerServiceActor, input: CustomerServiceInput, options: { allowExisting?: boolean; allowUnprivilegedCommercial?: boolean } = {}) {
  assertActor(actor)
  if (input.priceListId !== undefined && input.priceListId !== null && input.priceListId !== '') {
    const listId = text(input.priceListId, 128)
    const list = await db.priceList.findFirst({ where: { id: listId, tenantId: actor.tenantId, isActive: true }, select: { id: true } })
    if (!list) throw new CustomerServiceError('not_found', 'Lista de precios no encontrada.')
  }
  const fields = { ...identityFields(input), ...optionalFields(input, actor, options) }
  const existing = await duplicate(db, actor.tenantId, fields)
  const addresses = input.addresses === undefined ? undefined : addressesInput(input.addresses)
  if (existing && !options.allowExisting) throw new CustomerServiceError('conflict', 'Ya existe una ficha con esos datos.')
  const customer = existing
    ? await db.customer.update({ where: { id: existing.id }, data: { ...fields, ...(addresses === undefined ? {} : { addresses: { deleteMany: {}, create: addresses } }) }, include: customerInclude })
    : await db.customer.create({ data: ({ tenantId: actor.tenantId, createdById: actor.id, ...fields, ...(addresses ? { addresses: { create: addresses } } : {}) } as any), include: customerInclude })
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: existing ? 'CUSTOMER_UPDATED' : 'CUSTOMER_CREATED', entity: 'Customer', entityId: customer.id, metadata: { source: 'integration', ...(existing ? { fields: Object.keys(fields) } : {}) } } })
  return serializeCustomer(customer)
}

export async function updateCustomer(
  db: Db,
  actor: CustomerServiceActor,
  id: string,
  input: CustomerServiceInput,
  options: { allowIdentityCollision?: boolean; allowUnprivilegedCommercial?: boolean } = {},
) {
  assertActor(actor)
  if (input.priceListId !== undefined && input.priceListId !== null && input.priceListId !== '') {
    const listId = text(input.priceListId, 128)
    const list = await db.priceList.findFirst({ where: { id: listId, tenantId: actor.tenantId, isActive: true }, select: { id: true } })
    if (!list) throw new CustomerServiceError('not_found', 'Lista de precios no encontrada.')
  }
  const existing = await db.customer.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, blocked: true } })
  if (!existing) throw new CustomerServiceError('not_found', 'Cliente no encontrado.')
  const patchInput = Object.hasOwn(input, 'blockedReason') && !Object.hasOwn(input, 'blocked') ? { ...input, blocked: existing.blocked } : input
  const requestsBlockingChange = Object.hasOwn(patchInput, 'blocked') || Object.hasOwn(patchInput, 'blockedReason')
  const fields = { ...identityFields(patchInput, true), ...optionalFields(patchInput, actor, options) }
  const identityForDuplicate = { document: fields.document ?? null, phone: fields.phone ?? null, externalId: fields.externalId ?? null }
  const duplicateRow = await duplicate(db, actor.tenantId, identityForDuplicate, id)
  // The public HTTP contract historically allowed temporarily matching
  // identities so the duplicate-merge flow can create the collision before
  // moving history. Integrations keep the safer default and must opt in.
  if (duplicateRow && !options.allowIdentityCollision) throw new CustomerServiceError('conflict', 'Ya existe otra ficha con esos datos.')
  const addresses = input.addresses === undefined ? undefined : addressesInput(input.addresses)
  const customer = await db.customer.update({ where: { id }, data: { ...fields, ...(addresses === undefined ? {} : { addresses: { deleteMany: {}, create: addresses } }) }, include: customerInclude })
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: 'CUSTOMER_UPDATED', entity: 'Customer', entityId: customer.id, metadata: { source: 'integration', fields: Object.keys(fields) } } })
  if (requestsBlockingChange && (Boolean(fields.blocked) !== existing.blocked || Boolean(fields.blocked))) {
    await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: fields.blocked ? 'CUSTOMER_BLOCKED' : 'CUSTOMER_UNBLOCKED', entity: 'Customer', entityId: customer.id, metadata: { reason: fields.blockedReason ?? null, previous: existing.blocked } } })
  }
  return serializeCustomer(customer)
}

export async function withCustomerTransaction<T>(actor: CustomerServiceActor, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  assertActor(actor)
  return prisma.$transaction(operation)
}
